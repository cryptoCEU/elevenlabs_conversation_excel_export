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
  caller_phone: string; // empty string if chat / no phone
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: "user" | "agent";
  message: string;
  time_in_call_secs: number;
}

export interface ConversationDetail extends ConversationSummary {
  transcript: ConversationMessage[];
  analysis?: {
    evaluation_criteria_results?: Record<string, unknown>;
    data_collection_results?: Record<string, unknown>;
    call_successful?: string;
    transcript_summary?: string;
  };
  conversation_duration_secs?: number;
  wait_time_secs?: number;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  has_more: boolean;
  next_cursor?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// Searches root + metadata for a phone number string
// ElevenLabs stores phone in different places depending on integration type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickPhone(raw: any): string {
  const PHONE_FIELDS = [
    "caller_id", "caller_phone_number", "caller_phone",
    "phone_number", "from_number", "from", "phone",
    "caller", "call_from",
  ];
  const sources = [raw, raw?.metadata ?? {}, raw?.call_data ?? {}, raw?.phone_call ?? {}];
  for (const src of sources) {
    for (const f of PHONE_FIELDS) {
      const v = src?.[f];
      if (typeof v === "string" && v.trim().length > 0 && v !== "null") {
        return v.trim();
      }
    }
  }
  return "";
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

  const items: ConversationSummary[] = (raw.conversations ?? raw.items ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => ({ ...c, caller_phone: pickPhone(c) })
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

  // Log structure to Vercel Function Logs for debugging
  console.log("[detail] top keys:", Object.keys(raw));
  if (raw.metadata) console.log("[detail] metadata keys:", Object.keys(raw.metadata));
  console.log("[detail] phone fields:", JSON.stringify({
    caller_id: raw.caller_id,
    caller_phone_number: raw.caller_phone_number,
    phone_number: raw.phone_number,
    metadata_caller: raw.metadata?.caller_id,
    metadata_phone: raw.metadata?.phone_number,
    metadata_from: raw.metadata?.from_number,
  }));

  const startTime = pickNumber(raw, [
    "start_time_unix_secs", "start_time", "created_at_unix_secs",
    "created_at", "started_at", "initiation_time",
  ]);
  const callDuration = pickNumber(raw, [
    "call_duration_secs", "duration_secs", "duration",
    "call_duration", "length_secs", "total_duration_secs",
  ]);

  return {
    ...raw,
    conversation_id: raw.conversation_id ?? conversationId,
    agent_id: raw.agent_id ?? "",
    status: raw.status ?? "",
    start_time_unix_secs: startTime,
    call_duration_secs: callDuration,
    message_count: raw.message_count ?? raw.transcript?.length ?? 0,
    caller_phone: pickPhone(raw),
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
