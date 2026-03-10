// lib/queues.ts
// Shared types — used by both client and server

export interface Queue {
  id: string;
  name: string;
  agent_ids: string[]; // ElevenLabs agent_id values
  created_at?: string;
}

export function getQueueForAgent(queues: Queue[], agentId: string): Queue | undefined {
  return queues.find((q) => q.agent_ids.includes(agentId));
}
