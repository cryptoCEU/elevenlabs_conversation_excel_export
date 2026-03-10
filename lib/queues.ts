// lib/queues.ts

export interface Queue {
  id: string;
  name: string;
  agentIds: string[]; // ElevenLabs agent_id values
}

const STORAGE_KEY = "el_exporter_queues";

export function loadQueues(): Queue[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Queue[]) : [];
  } catch {
    return [];
  }
}

export function saveQueues(queues: Queue[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queues));
}

export function createQueue(name: string): Queue {
  return { id: crypto.randomUUID(), name: name.trim(), agentIds: [] };
}

export function getQueueForAgent(queues: Queue[], agentId: string): Queue | undefined {
  return queues.find((q) => q.agentIds.includes(agentId));
}
