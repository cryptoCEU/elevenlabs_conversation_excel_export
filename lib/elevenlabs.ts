// lib/elevenlabs.ts
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export interface Agent { agent_id: string; name: string; }

export interface ConversationSummary {
  conversation_id: string;
  agent_id: string;
  status: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
  caller_phone: string; // who called in  → metadata.phone_call.external_number
  called_phone: string; // number dialed  → metadata.phone_call.agent_number
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: "user" | "agent";
  message: string;
  time_in_call_secs: number;
}

export interface ConversationDetail extends ConversationSummary {
  transcript: ConversationMessage[];
  analysis?: Record<string, unknown>;
  conversation_duration_secs?: number;
  wait_time_secs?: number;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  has_more: boolean;
  next_cursor?: string;
}

// ── Phone extraction ──────────────────────────────────────────────────────────
// Primary:  metadata.phone_call.external_number / agent_number
// Fallback: conversation_initiation_client_data.dynamic_variables.system__caller_id / system__called_number
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPhone(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("+") && v.length >= 7;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPhones(raw: any): { caller_phone: string; called_phone: string } {
  const pc = raw?.metadata?.phone_call;
  const dv = raw?.conversation_initiation_client_data?.dynamic_variables;

  // Priority: phone_call block > dynamic_variables > user_id (only if real phone number)
  const caller_phone =
    (isPhone(pc?.external_number) ? pc.external_number : null) ??
    (isPhone(dv?.system__caller_id) ? dv.system__caller_id : null) ??
    (isPhone(raw?.user_id) ? raw.user_id : null) ??
    "";

  const called_phone =
    (isPhone(pc?.agent_number) ? pc.agent_number : null) ??
    (isPhone(dv?.system__called_number) ? dv.system__called_number : null) ??
    "";

  return { caller_phone, called_phone };
}

// ── Numeric field extraction ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickNumber(raw: any, fields: string[]): number {
  const sources = [raw, raw?.metadata ?? {}];
  for (const src of sources) {
    for (const f of fields) {
      const v = src?.[f];
      if (typeof v === "number" && v > 0) {
        return v > 1e12 ? Math.round(v / 1000) : Math.round(v);
      }
      if (typeof v === "string" && v.length > 0) {
        const n = Date.parse(v);
        if (!isNaN(n)) return Math.round(n / 1000);
      }
    }
  }
  return 0;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
export async function fetchConversationsPage(
  apiKey: string, agentId: string, cursor?: string, pageSize = 100
): Promise<{ conversations: ConversationSummary[]; has_more: boolean; next_cursor?: string }> {
  const params = new URLSearchParams({ agent_id: agentId, page_size: String(pageSize) });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${ELEVENLABS_BASE}/convai/conversations?${params}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await res.json();

  // The list endpoint has less data than the detail endpoint.
  // For phone calls, the caller number may appear in metadata.phone_call or user_id (if starts with +).
  const items: ConversationSummary[] = (raw.conversations ?? raw.items ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => ({ ...c, ...extractPhones(c) })
  );

  return { conversations: items, has_more: raw.has_more ?? false, next_cursor: raw.next_cursor };
}

export async function fetchConversationsInRange(
  apiKey: string, agentId: string, dateFrom?: number, dateTo?: number
): Promise<ConversationSummary[]> {
  const all: ConversationSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchConversationsPage(apiKey, agentId, cursor);
    for (const conv of page.conversations) {
      const t = conv.start_time_unix_secs;
      if (dateTo && t > dateTo) continue;
      if (dateFrom && t < dateFrom) return all;
      all.push(conv);
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return all;
}

export async function fetchConversationDetail(
  apiKey: string, conversationId: string
): Promise<ConversationDetail> {
  const res = await fetch(`${ELEVENLABS_BASE}/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await res.json();

  const startTime = pickNumber(raw, [
    "start_time_unix_secs", "start_time", "created_at_unix_secs",
    "created_at", "started_at", "initiation_time",
  ]);
  const callDuration = pickNumber(raw, [
    "call_duration_secs", "duration_secs", "duration",
    "call_duration", "length_secs", "total_duration_secs",
  ]);

  const { caller_phone, called_phone } = extractPhones(raw);

  return {
    ...raw,
    conversation_id: raw.conversation_id ?? conversationId,
    agent_id: raw.agent_id ?? "",
    status: raw.status ?? "",
    start_time_unix_secs: startTime,
    call_duration_secs: callDuration,
    message_count: raw.message_count ?? raw.transcript?.length ?? 0,
    caller_phone,
    called_phone,
    transcript: Array.isArray(raw.transcript) ? raw.transcript : [],
  };
}

// ── Timing derivation ─────────────────────────────────────────────────────────
export function deriveTimings(conv: ConversationDetail): { conversationSecs: number; waitSecs: number } {
  if (typeof conv.conversation_duration_secs === "number" && typeof conv.wait_time_secs === "number") {
    return { conversationSecs: Math.round(conv.conversation_duration_secs), waitSecs: Math.round(conv.wait_time_secs) };
  }
  const totalSecs = conv.call_duration_secs ?? 0;
  if (!conv.transcript?.length) return { conversationSecs: totalSecs, waitSecs: 0 };
  const firstAt = conv.transcript[0]?.time_in_call_secs ?? 0;
  const waitSecs = Math.max(0, Math.round(firstAt));
  return { conversationSecs: Math.max(0, totalSecs - waitSecs), waitSecs };
}
