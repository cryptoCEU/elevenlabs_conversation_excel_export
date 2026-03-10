// lib/elevenlabs.ts

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export interface Agent {
  agent_id: string;
  name: string;
}

export interface ConversationSummary {
  conversation_id: string;
  agent_id: string;
  status: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
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

// ── Safe number extraction ────────────────────────────────────────────────────
// ElevenLabs sometimes returns timestamps in ms instead of seconds,
// or with different field names. This normalises them.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeUnixSecs(raw: any, fieldNames: string[]): number {
  for (const f of fieldNames) {
    const v = raw[f];
    if (typeof v === "number" && v > 0) {
      // If value looks like milliseconds (> year 3000 in seconds = 32503680000)
      return v > 1e12 ? Math.round(v / 1000) : v;
    }
    if (typeof v === "string" && v.length > 0) {
      const n = Date.parse(v);
      if (!isNaN(n)) return Math.round(n / 1000);
    }
  }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeDurationSecs(raw: any, fieldNames: string[]): number {
  for (const f of fieldNames) {
    const v = raw[f];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }
  return 0;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

export async function fetchConversationsPage(
  apiKey: string,
  agentId: string,
  cursor?: string,
  pageSize = 100
): Promise<ConversationsResponse> {
  const params = new URLSearchParams({ agent_id: agentId, page_size: String(pageSize) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${ELEVENLABS_BASE}/convai/conversations?${params}`, {
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  return res.json();
}

export async function fetchConversationsInRange(
  apiKey: string,
  agentId: string,
  dateFrom?: number,
  dateTo?: number
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
  apiKey: string,
  conversationId: string
): Promise<ConversationDetail> {
  const res = await fetch(
    `${ELEVENLABS_BASE}/convai/conversations/${conversationId}`,
    { headers: { "xi-api-key": apiKey, "Content-Type": "application/json" } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await res.json();

  // Normalise fields that may have different names in different API versions
  const normalised: ConversationDetail = {
    ...raw,
    conversation_id: raw.conversation_id ?? raw.id ?? conversationId,
    agent_id: raw.agent_id ?? "",
    status: raw.status ?? "",
    start_time_unix_secs: safeUnixSecs(raw, [
      "start_time_unix_secs",
      "start_time",
      "created_at_unix_secs",
      "created_at",
      "started_at",
    ]),
    call_duration_secs: safeDurationSecs(raw, [
      "call_duration_secs",
      "duration_secs",
      "duration",
      "call_duration",
      "length_secs",
    ]),
    message_count: raw.message_count ?? raw.transcript?.length ?? 0,
    transcript: Array.isArray(raw.transcript) ? raw.transcript : [],
  };

  return normalised;
}

// ── Timing derivation ─────────────────────────────────────────────────────────

export function deriveTimings(conv: ConversationDetail): {
  conversationSecs: number;
  waitSecs: number;
} {
  // If API returns explicit timing fields, use them
  if (
    typeof conv.conversation_duration_secs === "number" &&
    typeof conv.wait_time_secs === "number"
  ) {
    return {
      conversationSecs: Math.round(conv.conversation_duration_secs),
      waitSecs: Math.round(conv.wait_time_secs),
    };
  }

  const totalSecs = conv.call_duration_secs ?? 0;

  if (!conv.transcript || conv.transcript.length === 0) {
    return { conversationSecs: totalSecs, waitSecs: 0 };
  }

  // First message timestamp = wait/connection time
  const firstMessageAt = conv.transcript[0]?.time_in_call_secs ?? 0;
  const waitSecs = Math.max(0, Math.round(firstMessageAt));
  const conversationSecs = Math.max(0, totalSecs - waitSecs);

  return { conversationSecs, waitSecs };
}
