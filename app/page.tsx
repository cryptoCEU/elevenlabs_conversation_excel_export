"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Download, RefreshCw, Bot, XCircle, MessageSquare,
  FileSpreadsheet, Loader2, ExternalLink, Calendar,
  ChevronDown, Search, BarChart2, TableProperties,
  Layers, Plus, Trash2, Check, X, Pencil,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { Queue } from "@/lib/queues";
import { loadQueues, saveQueues, createQueue, getQueueForAgent } from "@/lib/queues";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Agent { agent_id: string; name: string; }
interface ConversationSummary {
  conversation_id: string; agent_id: string; status: string;
  start_time_unix_secs: number; call_duration_secs: number; message_count: number;
}
type Grouping = "dia" | "semana" | "mes";
type RangePreset = "7d" | "30d" | "90d" | "custom";
type MainTab = "datos" | "colas";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function presetDates(p: RangePreset) {
  const to = new Date(), from = new Date();
  if (p === "7d") from.setDate(from.getDate() - 6);
  else if (p === "30d") from.setDate(from.getDate() - 29);
  else if (p === "90d") from.setDate(from.getDate() - 89);
  return { from: toISO(from), to: toISO(to) };
}
function groupKey(unix: number, g: Grouping) {
  const d = new Date(unix * 1000);
  if (g === "dia") return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  if (g === "semana") {
    const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return `Sem ${t.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}`;
  }
  return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}
function sortKey(unix: number, g: Grouping) {
  const d = new Date(unix * 1000);
  if (g === "dia") return toISO(d);
  if (g === "semana") {
    const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return toISO(t);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, unit = "" }: {
  active?: boolean; payload?: { value: number; color: string }[]; label?: string; unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#16161f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "var(--muted)", marginBottom: 6, fontFamily: "monospace" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          {p.value}{unit}
        </div>
      ))}
    </div>
  );
}

// ── Stats hook ────────────────────────────────────────────────────────────────
function useStats(conversations: ConversationSummary[], grouping: Grouping) {
  return useMemo(() => {
    if (!conversations.length) return null;
    const grouped: Record<string, { label: string; sk: string; total: number; durSum: number }> = {};
    const byHour: Record<number, number> = {};
    const byStatus: Record<string, number> = {};
    const durBuckets: Record<string, number> = { "<1m": 0, "1-2m": 0, "2-5m": 0, "5-10m": 0, ">10m": 0 };
    for (const c of conversations) {
      const t = c.start_time_unix_secs, dur = c.call_duration_secs ?? 0;
      const label = groupKey(t, grouping), sk = sortKey(t, grouping);
      const dt = new Date(t * 1000);
      if (!grouped[sk]) grouped[sk] = { label, sk, total: 0, durSum: 0 };
      grouped[sk].total++; grouped[sk].durSum += dur;
      byHour[dt.getHours()] = (byHour[dt.getHours()] ?? 0) + 1;
      const st = c.status?.toLowerCase() ?? "unknown";
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (dur < 60) durBuckets["<1m"]++;
      else if (dur < 120) durBuckets["1-2m"]++;
      else if (dur < 300) durBuckets["2-5m"]++;
      else if (dur < 600) durBuckets["5-10m"]++;
      else durBuckets[">10m"]++;
    }
    const groupedData = Object.values(grouped).sort((a, b) => a.sk.localeCompare(b.sk))
      .map(v => ({ date: v.label, llamadas: v.total, durMedia: Math.round(v.durSum / v.total / 60 * 10) / 10 }));
    const hourData = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, "0")}h`, llamadas: byHour[h] ?? 0 }));
    const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));
    const durData = Object.entries(durBuckets).map(([name, value]) => ({ name, value }));
    const totalDur = conversations.reduce((a, c) => a + (c.call_duration_secs ?? 0), 0);
    const avgDur = Math.round(totalDur / conversations.length);
    const maxDur = Math.max(...conversations.map(c => c.call_duration_secs ?? 0));
    const completed = conversations.filter(c => ["done", "completed"].includes(c.status?.toLowerCase())).length;
    return { groupedData, hourData, statusData, durData, avgDur, maxDur, completed };
  }, [conversations, grouping]);
}

const COLORS = ["#6c63ff", "#22d3a3", "#ff6584", "#f59e0b", "#60a5fa"];
const STATUS_COLORS: Record<string, string> = { done: "#22d3a3", completed: "#22d3a3", processing: "#f59e0b", failed: "#ff6584", error: "#ff6584" };

// ── Pill ──────────────────────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 14px", borderRadius: 20, border: "1px solid",
      borderColor: active ? "var(--accent)" : "var(--border)",
      background: active ? "rgba(108,99,255,0.15)" : "transparent",
      color: active ? "var(--accent)" : "var(--muted)",
      fontSize: 12, fontWeight: 600, cursor: "pointer",
      fontFamily: "'Space Mono', monospace", transition: "all 0.15s", whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

// ── Agent Dropdown ────────────────────────────────────────────────────────────
function AgentDropdown({ agents, value, onChange, placeholder = "Seleccionar agente..." }: {
  agents: Agent[]; value: Agent | null; onChange: (a: Agent | null) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", background: "#0d0d16", border: "1px solid var(--border)", borderRadius: 8,
        color: value ? "var(--text)" : "var(--muted)", padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", fontSize: 13, fontFamily: "'Space Mono', monospace",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? value.name : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: 8, color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#111118", border: "1px solid var(--border)", borderRadius: 8, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {agents.map(a => (
            <button key={a.agent_id} onClick={() => { onChange(a); setOpen(false); }}
              style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: value?.agent_id === a.agent_id ? "rgba(108,99,255,0.12)" : "transparent", color: value?.agent_id === a.agent_id ? "var(--accent)" : "var(--text)", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", borderBottom: "1px solid rgba(30,30,46,0.6)", display: "flex", alignItems: "center", gap: 8 }}>
              <Bot size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />{a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Queue Dropdown ────────────────────────────────────────────────────────────
function QueueDropdown({ queues, value, onChange, placeholder = "Seleccionar cola..." }: {
  queues: Queue[]; value: Queue | null; onChange: (q: Queue | null) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", background: "#0d0d16", border: "1px solid var(--border)", borderRadius: 8,
        color: value ? "var(--text)" : "var(--muted)", padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", fontSize: 13, fontFamily: "'Space Mono', monospace",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? value.name : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: 8, color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#111118", border: "1px solid var(--border)", borderRadius: 8, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {queues.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted)" }}>No hay colas creadas</div>
          )}
          {queues.map(q => (
            <button key={q.id} onClick={() => { onChange(q); setOpen(false); }}
              style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: value?.id === q.id ? "rgba(108,99,255,0.12)" : "transparent", color: value?.id === q.id ? "var(--accent)" : "var(--text)", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", borderBottom: "1px solid rgba(30,30,46,0.6)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />{q.name}
              </div>
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{q.agentIds.length} agente{q.agentIds.length !== 1 ? "s" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Queue Management Panel ────────────────────────────────────────────────────
function QueueManager({ queues, agents, onChange }: {
  queues: Queue[]; agents: Agent[]; onChange: (qs: Queue[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function addQueue() {
    if (!newName.trim()) return;
    const updated = [...queues, createQueue(newName)];
    onChange(updated); saveQueues(updated); setNewName("");
  }

  function deleteQueue(id: string) {
    const updated = queues.filter(q => q.id !== id);
    onChange(updated); saveQueues(updated);
  }

  function renameQueue(id: string) {
    if (!editName.trim()) return;
    const updated = queues.map(q => q.id === id ? { ...q, name: editName.trim() } : q);
    onChange(updated); saveQueues(updated); setEditingId(null);
  }

  function toggleAgentInQueue(queueId: string, agentId: string) {
    const updated = queues.map(q => {
      if (q.id !== queueId) return q;
      const has = q.agentIds.includes(agentId);
      return { ...q, agentIds: has ? q.agentIds.filter(id => id !== agentId) : [...q.agentIds, agentId] };
    });
    onChange(updated); saveQueues(updated);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Create new queue */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nueva cola</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Crea una cola y asigna agentes de ElevenLabs a ella</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="input"
            placeholder="Ej: Soporte técnico, Ventas, Recepción..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addQueue()}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" onClick={addQueue} disabled={!newName.trim()}
            style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <Plus size={14} /> Crear cola
          </button>
        </div>
      </div>

      {/* Queue list */}
      {queues.length === 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <Layers size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>No hay colas creadas todavía.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Crea una cola para asignar agentes a ella.</div>
        </div>
      )}

      {queues.map(queue => (
        <div key={queue.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Queue header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {editingId === queue.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <input
                  className="input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") renameQueue(queue.id); if (e.key === "Escape") setEditingId(null); }}
                  style={{ maxWidth: 280 }}
                  autoFocus
                />
                <button onClick={() => renameQueue(queue.id)} style={{ background: "var(--success)", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <Check size={13} color="white" />
                </button>
                <button onClick={() => setEditingId(null)} style={{ background: "rgba(255,101,132,0.15)", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <X size={13} color="var(--accent2)" />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Layers size={15} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{queue.name}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{queue.agentIds.length} agente{queue.agentIds.length !== 1 ? "s" : ""}</span>
              </div>
            )}
            {editingId !== queue.id && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditingId(queue.id); setEditName(queue.name); }}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--muted)" }}>
                  <Pencil size={12} />
                </button>
                <button onClick={() => deleteQueue(queue.id)}
                  style={{ background: "rgba(255,101,132,0.08)", border: "1px solid rgba(255,101,132,0.2)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--accent2)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Agent assignment */}
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, letterSpacing: "0.05em" }}>AGENTES ASIGNADOS</div>
            {agents.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Carga los agentes primero desde la pestaña Datos.</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {agents.map(agent => {
                const assigned = queue.agentIds.includes(agent.agent_id);
                const otherQueue = !assigned && getQueueForAgent(queues, agent.agent_id);
                return (
                  <button key={agent.agent_id}
                    onClick={() => toggleAgentInQueue(queue.id, agent.agent_id)}
                    title={otherQueue ? `Asignado a: ${otherQueue.name}` : ""}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                      borderRadius: 8, border: "1px solid",
                      borderColor: assigned ? "var(--success)" : otherQueue ? "var(--warning)" : "var(--border)",
                      background: assigned ? "rgba(34,211,163,0.1)" : otherQueue ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.02)",
                      color: assigned ? "var(--success)" : otherQueue ? "var(--warning)" : "var(--text)",
                      cursor: "pointer", fontSize: 12, transition: "all 0.15s",
                    }}>
                    {assigned ? <Check size={12} /> : <Bot size={12} style={{ color: "var(--muted)" }} />}
                    {agent.name}
                    {otherQueue && <span style={{ fontSize: 10, color: "var(--warning)" }}>({otherQueue.name})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("datos");
  const [dataTab, setDataTab] = useState<"tabla" | "graficos">("tabla");
  const [grouping, setGrouping] = useState<Grouping>("dia");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [dateFrom, setDateFrom] = useState(presetDates("30d").from);
  const [dateTo, setDateTo] = useState(presetDates("30d").to);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [fetched, setFetched] = useState(false);

  const stats = useStats(conversations, grouping);

  // Agents in selected queue
  const queueAgents = useMemo(() =>
    selectedQueue ? agents.filter(a => selectedQueue.agentIds.includes(a.agent_id)) : [],
    [selectedQueue, agents]
  );

  useEffect(() => {
    setQueues(loadQueues());
    loadAgents();
  }, []);

  useEffect(() => {
    if (preset === "7d") setGrouping("dia");
    else if (preset === "30d") setGrouping("dia");
    else if (preset === "90d") setGrouping("semana");
  }, [preset]);

  function applyPreset(p: RangePreset) {
    setPreset(p);
    if (p !== "custom") { const d = presetDates(p); setDateFrom(d.from); setDateTo(d.to); }
  }

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true); setError("");
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAgents(data.agents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar agentes");
    } finally { setLoadingAgents(false); }
  }, []);

  const loadConversations = useCallback(async () => {
    // Collect agent IDs to query
    let agentIds: string[] = [];
    let colName = "Agente";

    if (selectedQueue) {
      agentIds = selectedQueue.agentIds;
      colName = selectedQueue.name;
      if (agentIds.length === 0) { setError("La cola seleccionada no tiene agentes asignados."); return; }
    } else if (selectedAgent) {
      agentIds = [selectedAgent.agent_id];
      colName = getQueueForAgent(queues, selectedAgent.agent_id)?.name ?? selectedAgent.name;
    } else {
      setError("Selecciona una cola o un agente."); return;
    }

    setLoadingConvs(true); setError(""); setConversations([]); setSelected(new Set()); setFetched(false);
    try {
      const allConvs: ConversationSummary[] = [];
      for (const agentId of agentIds) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, dateFrom, dateTo }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        allConvs.push(...data.conversations);
      }
      // Sort by date desc
      allConvs.sort((a, b) => b.start_time_unix_secs - a.start_time_unix_secs);
      setConversations(allConvs);
      setSelected(new Set(allConvs.map(c => c.conversation_id)));
      setFetched(true);
      // Store colName for export
      sessionStorage.setItem("export_col_name", colName);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar conversaciones");
    } finally { setLoadingConvs(false); }
  }, [selectedQueue, selectedAgent, queues, dateFrom, dateTo]);

  const exportExcel = useCallback(async () => {
    if (selected.size === 0) { setError("Selecciona al menos una conversación."); return; }
    const colName = sessionStorage.getItem("export_col_name") ?? "Agente";
    setExporting(true); setError("");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: colName, conversationIds: Array.from(selected) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversaciones_${colName.replace(/\s+/g, "_")}_${dateFrom}_${dateTo}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally { setExporting(false); }
  }, [selected, dateFrom, dateTo]);

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(selected.size === conversations.length ? new Set() : new Set(conversations.map(c => c.conversation_id)));
  const allSelected = conversations.length > 0 && selected.size === conversations.length;

  const card = (extra?: React.CSSProperties) => ({ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, ...extra });

  const agentName = (agentId: string) => agents.find(a => a.agent_id === agentId)?.name ?? agentId;

  return (
    <div className="gradient-bg min-h-screen">
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, background: "var(--accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet size={18} color="white" />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700 }}>ElevenLabs Exporter</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Conversaciones → Excel</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={loadAgents} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} disabled={loadingAgents}>
              {loadingAgents ? <Loader2 size={13} className="spinner" /> : <RefreshCw size={13} />}
              Recargar agentes
            </button>
            <a href="https://elevenlabs.io/app/conversational-ai" target="_blank" rel="noopener noreferrer"
              className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              ElevenLabs <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Main nav tabs */}
        <div className="max-w-7xl mx-auto px-6" style={{ display: "flex", gap: 0, borderTop: "1px solid var(--border)" }}>
          {([["datos", TableProperties, "Datos"], ["colas", Layers, "Gestión de Colas"]] as const).map(([tab, Icon, label]) => (
            <button key={tab} onClick={() => setMainTab(tab)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "12px 20px",
              border: "none", borderBottom: mainTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent", color: mainTab === tab ? "var(--accent)" : "var(--muted)",
              fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
              marginBottom: -1,
            }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {error && (
          <div className="fade-up" style={{ padding: "12px 16px", background: "rgba(255,101,132,0.08)", border: "1px solid rgba(255,101,132,0.2)", borderRadius: 8, color: "var(--accent2)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <XCircle size={14} /> {error}
          </div>
        )}

        {/* ══════════ QUEUE MANAGER TAB ══════════ */}
        {mainTab === "colas" && (
          <QueueManager queues={queues} agents={agents} onChange={qs => { setQueues(qs); saveQueues(qs); }} />
        )}

        {/* ══════════ DATA TAB ══════════ */}
        {mainTab === "datos" && (
          <>
            {/* Filters */}
            <div style={card({ padding: 24 })} className="fade-up">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 20 }}>

                {/* Left block: queue + agent */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                      COLA <span style={{ color: "var(--border)" }}>— filtra todos los agentes asignados</span>
                    </label>
                    {loadingAgents
                      ? <div style={{ padding: "10px 14px", background: "#0d0d16", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={13} className="spinner" />Cargando...</div>
                      : <QueueDropdown queues={queues} value={selectedQueue} onChange={q => { setSelectedQueue(q); if (q) setSelectedAgent(null); setFetched(false); setConversations([]); }} />
                    }
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>o</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                      AGENTE INDIVIDUAL
                    </label>
                    {loadingAgents
                      ? <div style={{ padding: "10px 14px", background: "#0d0d16", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={13} className="spinner" />Cargando...</div>
                      : <AgentDropdown agents={agents} value={selectedAgent} onChange={a => { setSelectedAgent(a); if (a) setSelectedQueue(null); setFetched(false); setConversations([]); }} />
                    }
                  </div>
                  {/* Show agents in selected queue */}
                  {selectedQueue && queueAgents.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {queueAgents.map(a => (
                        <span key={a.agent_id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "rgba(108,99,255,0.1)", borderRadius: 20, fontSize: 11, color: "var(--accent)" }}>
                          <Bot size={10} />{a.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right block: range + dates */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={{ fontSize: 11, color: "var(--muted)" }}>RANGO</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["7d", "30d", "90d", "custom"] as RangePreset[]).map(p => (
                      <Pill key={p} label={p === "custom" ? "Custom" : p} active={preset === p} onClick={() => applyPreset(p)} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Calendar size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
                      <input className="input" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset("custom"); }} style={{ paddingLeft: 28, fontSize: 12 }} />
                    </div>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>→</span>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Calendar size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
                      <input className="input" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset("custom"); }} style={{ paddingLeft: 28, fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* Search button */}
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button className="btn-primary" onClick={loadConversations} disabled={loadingConvs || (!selectedQueue && !selectedAgent)}
                    style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", height: 42 }}>
                    {loadingConvs ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
                    {loadingConvs ? "Buscando..." : "Buscar"}
                  </button>
                </div>
              </div>
            </div>

            {/* KPIs */}
            {fetched && conversations.length > 0 && stats && (
              <>
                <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
                  {[
                    { label: "TOTAL LLAMADAS", value: conversations.length, color: "var(--accent)" },
                    { label: "COMPLETADAS", value: stats.completed, color: "var(--success)" },
                    { label: "TASA ÉXITO", value: `${Math.round(stats.completed / conversations.length * 100)}%`, color: "var(--success)" },
                    { label: "DURACIÓN MEDIA", value: fmt(stats.avgDur), color: "var(--accent)" },
                    { label: "DURACIÓN MÁXIMA", value: fmt(stats.maxDur), color: "var(--warning)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={card({ padding: "16px 18px" })}>
                      <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "monospace" }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Tab bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
                    {([["tabla", TableProperties, "Tabla"], ["graficos", BarChart2, "Gráficos"]] as const).map(([tab, Icon, label]) => (
                      <button key={tab} onClick={() => setDataTab(tab)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all 0.2s", background: dataTab === tab ? "var(--accent)" : "transparent", color: dataTab === tab ? "white" : "var(--muted)" }}>
                        <Icon size={14} />{label}
                      </button>
                    ))}
                  </div>
                  {dataTab === "graficos" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>AGRUPAR POR</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["dia", "semana", "mes"] as Grouping[]).map(g => (
                          <Pill key={g} label={g.charAt(0).toUpperCase() + g.slice(1)} active={grouping === g} onClick={() => setGrouping(g)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Charts */}
                {dataTab === "graficos" && (
                  <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div style={card({ padding: 24 })}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Llamadas por {grouping}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>Volumen de conversaciones</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={stats.groupedData}>
                            <defs>
                              <linearGradient id="gLL" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6c63ff" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fill: "#6b6b8a", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#6b6b8a", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip unit=" llamadas" />} />
                            <Area type="monotone" dataKey="llamadas" stroke="#6c63ff" strokeWidth={2} fill="url(#gLL)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={card({ padding: 24 })}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Duración media por {grouping}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>Minutos de media por conversación</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={stats.groupedData}>
                            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fill: "#6b6b8a", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#6b6b8a", fontSize: 10 }} axisLine={false} tickLine={false} unit="m" />
                            <Tooltip content={<ChartTooltip unit="m" />} />
                            <Line type="monotone" dataKey="durMedia" stroke="#22d3a3" strokeWidth={2} dot={{ fill: "#22d3a3", r: 3 }} activeDot={{ r: 5 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16 }}>
                      <div style={card({ padding: 24 })}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Llamadas por hora del día</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>Distribución horaria</div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={stats.hourData}>
                            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="hora" tick={{ fill: "#6b6b8a", fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
                            <YAxis tick={{ fill: "#6b6b8a", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip unit=" llamadas" />} />
                            <Bar dataKey="llamadas" radius={[4, 4, 0, 0]}>
                              {stats.hourData.map((e, i) => {
                                const mx = Math.max(...stats.hourData.map(d => d.llamadas));
                                return <Cell key={i} fill={e.llamadas === mx && mx > 0 ? "#6c63ff" : "#2a2a4a"} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={card({ padding: 24 })}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Estado</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Resultado llamadas</div>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={stats.statusData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                              {stats.statusData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.name] ?? COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip content={<ChartTooltip unit=" llamadas" />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                          {stats.statusData.map((s, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[s.name] ?? COLORS[i % COLORS.length], display: "inline-block" }} />
                                <span style={{ color: "var(--muted)" }}>{s.name}</span>
                              </div>
                              <span style={{ fontFamily: "monospace" }}>{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={card({ padding: 24 })}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Duración</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Distribución por rangos</div>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={stats.durData} layout="vertical">
                            <XAxis type="number" tick={{ fill: "#6b6b8a", fontSize: 9 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: "#6b6b8a", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                            <Tooltip content={<ChartTooltip unit=" llamadas" />} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {stats.durData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                          {stats.durData.map((d, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], display: "inline-block" }} />
                                <span style={{ color: "var(--muted)" }}>{d.name}</span>
                              </div>
                              <span style={{ fontFamily: "monospace" }}>{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table */}
                {dataTab === "tabla" && (
                  <div style={card({ overflow: "hidden" })} className="fade-up">
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>{selected.size} de {conversations.length} seleccionadas</span>
                      </div>
                      <button className="btn-success" onClick={exportExcel} disabled={exporting || selected.size === 0}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {exporting ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
                        {exporting ? "Exportando..." : `Exportar ${selected.size} a Excel`}
                      </button>
                    </div>
                    <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
                      <table className="data-table">
                        <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
                          <tr>
                            <th style={{ width: 40 }}></th>
                            <th>Fecha</th><th>Hora</th><th>Cola / Agente</th>
                            <th>Duración</th><th>Mensajes</th><th>Estado</th><th>ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conversations.map(c => {
                            const dt = new Date(c.start_time_unix_secs * 1000);
                            const q = getQueueForAgent(queues, c.agent_id);
                            return (
                              <tr key={c.conversation_id} style={{ cursor: "pointer" }} onClick={() => toggleSelect(c.conversation_id)}>
                                <td><input type="checkbox" checked={selected.has(c.conversation_id)} onChange={() => toggleSelect(c.conversation_id)} onClick={e => e.stopPropagation()} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} /></td>
                                <td className="mono" style={{ fontSize: 12 }}>{dt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                                <td className="mono" style={{ fontSize: 12 }}>{dt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                                <td>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {q && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{q.name}</span>}
                                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{agentName(c.agent_id)}</span>
                                  </div>
                                </td>
                                <td className="mono" style={{ fontSize: 12 }}>{fmt(c.call_duration_secs)}</td>
                                <td><div style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageSquare size={12} style={{ color: "var(--muted)" }} /><span className="mono" style={{ fontSize: 12 }}>{c.message_count}</span></div></td>
                                <td>
                                  {(() => {
                                    const s = c.status?.toLowerCase();
                                    if (s === "done" || s === "completed") return <span className="tag tag-done">✓ Completada</span>;
                                    if (s === "processing") return <span className="tag tag-processing">⟳ Procesando</span>;
                                    if (s === "failed" || s === "error") return <span className="tag tag-failed">✗ Error</span>;
                                    return <span className="tag tag-default">{c.status}</span>;
                                  })()}
                                </td>
                                <td className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{c.conversation_id.slice(0, 20)}…</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {fetched && conversations.length === 0 && !loadingConvs && (
              <div style={card({ padding: 48, textAlign: "center" })} className="fade-up">
                <MessageSquare size={32} style={{ margin: "0 auto 12px", opacity: 0.3, color: "var(--muted)" }} />
                <div style={{ fontSize: 14, color: "var(--muted)" }}>No hay conversaciones en ese rango.</div>
              </div>
            )}
            {!fetched && !loadingConvs && (
              <div style={card({ padding: 48, textAlign: "center" })} className="fade-up">
                <Search size={32} style={{ margin: "0 auto 12px", opacity: 0.3, color: "var(--muted)" }} />
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  {queues.length === 0 ? "Crea una cola en «Gestión de Colas» y asigna agentes para empezar." : "Selecciona una cola o agente y pulsa Buscar."}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 32 }}>
        <span className="mono">ElevenLabs Exporter</span> · Las colas se guardan en tu navegador
      </footer>
    </div>
  );
}
