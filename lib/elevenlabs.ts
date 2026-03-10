// lib/elevenlabs.ts

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// ── Agents ────────────────────────────────────────────────────────────────────

export interface Agent {
  agent_id: string;
  name: string;
  created_at_unix_secs?: number;
}

export interface AgentsResponse {
  agents: Agent[];
  has_more: boolean;
  next_cursor?: string;
}

export async function fetchAgents(apiKey: string): Promise<Agent[]> {
  const all: Agent[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${ELEVENLABS_BASE}/convai/agents?${params}`, {
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
    }

    const data: AgentsResponse = await res.json();
    all.push(...data.agents);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return all;
}

// ── Conversations ─────────────────────────────────────────────────────────────

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

export async function fetchConversationsPage(
  apiKey: string,
  agentId: string,
  cursor?: string,
  pageSize = 100
): Promise<ConversationsResponse> {
  const params = new URLSearchParams({
    agent_id: agentId,
    page_size: String(pageSize),
  });
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

  return res.json();
}

export function deriveTimings(conv: ConversationDetail): {
  conversationSecs: number;
  waitSecs: number;
} {
  if (
    typeof conv.conversation_duration_secs === "number" &&
    typeof conv.wait_time_secs === "number"
  ) {
    return {
      conversationSecs: conv.conversation_duration_secs,
      waitSecs: conv.wait_time_secs,
    };
  }

  const totalSecs = conv.call_duration_secs ?? 0;

  if (!conv.transcript || conv.transcript.length === 0) {
    return { conversationSecs: totalSecs, waitSecs: 0 };
  }

  const firstMessageAt = conv.transcript[0].time_in_call_secs ?? 0;
  const waitSecs = Math.max(0, firstMessageAt);
  const conversationSecs = Math.max(0, totalSecs - waitSecs);

  return { conversationSecs, waitSecs };
}
