"use client";
import { useState, useCallback } from "react";
import {
  Download, RefreshCw, Key, Bot, CheckCircle2, XCircle,
  Clock, MessageSquare, FileSpreadsheet, Loader2, Info,
  ExternalLink, Calendar, ChevronDown, Search,
} from "lucide-react";

interface Agent { agent_id: string; name: string; }
interface ConversationSummary {
  conversation_id: string;
  agent_id: string;
  status: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StatusTag({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "done" || s === "completed") return <span className="tag tag-done">✓ Completada</span>;
  if (s === "processing") return <span className="tag tag-processing pulse">⟳ Procesando</span>;
  if (s === "failed" || s === "error") return <span className="tag tag-failed">✗ Error</span>;
  return <span className="tag tag-default">{status}</span>;
}

// Default date range: last 30 days
function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  const defaults = defaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [fetched, setFetched] = useState(false);

  // ── Step 1: load agents ───────────────────────────────────────────────────
  const loadAgents = useCallback(async () => {
    if (!apiKey.trim()) { setError("Introduce tu API Key de ElevenLabs."); return; }
    setLoadingAgents(true);
    setError("");
    setAgents([]);
    setSelectedAgent(null);
    setConversations([]);
    setFetched(false);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAgents(data.agents);
      if (data.agents.length === 1) setSelectedAgent(data.agents[0]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al conectar con ElevenLabs");
    } finally {
      setLoadingAgents(false);
    }
  }, [apiKey]);

  // ── Step 2: load conversations ────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!selectedAgent) { setError("Selecciona un agente."); return; }
    if (!dateFrom || !dateTo) { setError("Selecciona un rango de fechas."); return; }
    setLoadingConvs(true);
    setError("");
    setConversations([]);
    setSelected(new Set());
    setFetched(false);

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, agentId: selectedAgent.agent_id, dateFrom, dateTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConversations(data.conversations);
      setSelected(new Set(data.conversations.map((c: ConversationSummary) => c.conversation_id)));
      setFetched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar conversaciones");
    } finally {
      setLoadingConvs(false);
    }
  }, [apiKey, selectedAgent, dateFrom, dateTo]);

  // ── Step 3: export ────────────────────────────────────────────────────────
  const exportExcel = useCallback(async () => {
    if (selected.size === 0) { setError("Selecciona al menos una conversación."); return; }
    setExporting(true);
    setError("");

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          agentName: selectedAgent?.name ?? "Agente",
          conversationIds: Array.from(selected),
        }),
      });

      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversaciones_${selectedAgent?.name?.replace(/\s+/g, "_")}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }, [apiKey, selectedAgent, selected, dateFrom, dateTo]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected(selected.size === conversations.length
      ? new Set()
      : new Set(conversations.map((c) => c.conversation_id))
    );
  };
  const allSelected = conversations.length > 0 && selected.size === conversations.length;

  const avgDuration = conversations.length
    ? Math.round(conversations.reduce((a, c) => a + c.call_duration_secs, 0) / conversations.length)
    : 0;

  return (
    <div className="gradient-bg min-h-screen">
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ width:36, height:36, background:"var(--accent)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <FileSpreadsheet size={18} color="white" />
            </div>
            <div>
              <div className="mono" style={{ fontSize:14, fontWeight:700 }}>ElevenLabs Exporter</div>
              <div style={{ fontSize:11, color:"var(--muted)" }}>Conversaciones → Excel</div>
            </div>
          </div>
          <a href="https://elevenlabs.io/app/conversational-ai" target="_blank" rel="noopener noreferrer"
            className="btn-ghost" style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
            ElevenLabs <ExternalLink size={12} />
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8" style={{ display:"flex", flexDirection:"column", gap:20 }}>

        {/* ── Step 1: API Key + Agents ─────────────────────────────────────── */}
        <div className="card p-6 fade-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="mono" style={{ fontSize:10, color:"var(--accent)", fontWeight:700, letterSpacing:"0.08em" }}>PASO 1</div>
            <Key size={13} style={{ color:"var(--accent)" }} />
            <span style={{ fontWeight:600, fontSize:14 }}>API Key</span>
          </div>

          <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:6 }}>API KEY DE ELEVENLABS</label>
              <input className="input" type="password" placeholder="xi-..."
                value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadAgents()}
              />
            </div>
            <button className="btn-primary" onClick={loadAgents} disabled={loadingAgents}
              style={{ display:"flex", alignItems:"center", gap:8, whiteSpace:"nowrap" }}>
              {loadingAgents ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
              {loadingAgents ? "Cargando..." : "Cargar agentes"}
            </button>
          </div>

          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--muted)" }}>
            <Info size={12} style={{ color:"var(--accent)", flexShrink:0 }} />
            API Key en <strong style={{ color:"var(--text)" }}>elevenlabs.io → Settings → API Keys</strong>
          </div>
        </div>

        {/* ── Step 2: Agent selector + date range ─────────────────────────── */}
        {agents.length > 0 && (
          <div className="card p-6 fade-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="mono" style={{ fontSize:10, color:"var(--accent)", fontWeight:700, letterSpacing:"0.08em" }}>PASO 2</div>
              <Bot size={13} style={{ color:"var(--accent)" }} />
              <span style={{ fontWeight:600, fontSize:14 }}>Agente y rango de fechas</span>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:12, alignItems:"flex-end" }}>
              {/* Agent dropdown */}
              <div style={{ position:"relative" }}>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:6 }}>AGENTE</label>
                <button
                  onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                  style={{
                    width:"100%", background:"#0d0d16", border:"1px solid var(--border)",
                    borderRadius:8, color: selectedAgent ? "var(--text)" : "var(--muted)",
                    padding:"10px 14px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", cursor:"pointer", fontSize:13,
                    fontFamily:"'Space Mono', monospace",
                  }}
                >
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {selectedAgent ? selectedAgent.name : "Seleccionar agente..."}
                  </span>
                  <ChevronDown size={14} style={{ flexShrink:0, marginLeft:8, color:"var(--muted)", transform: agentDropdownOpen ? "rotate(180deg)" : "none", transition:"transform 0.2s" }} />
                </button>

                {agentDropdownOpen && (
                  <div style={{
                    position:"absolute", top:"calc(100% + 4px)", left:0, right:0,
                    background:"#111118", border:"1px solid var(--border)",
                    borderRadius:8, zIndex:50, overflow:"hidden",
                    boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
                  }}>
                    {agents.map((agent) => (
                      <button key={agent.agent_id}
                        onClick={() => { setSelectedAgent(agent); setAgentDropdownOpen(false); setFetched(false); setConversations([]); }}
                        style={{
                          width:"100%", padding:"10px 14px", textAlign:"left",
                          background: selectedAgent?.agent_id === agent.agent_id ? "rgba(108,99,255,0.12)" : "transparent",
                          color: selectedAgent?.agent_id === agent.agent_id ? "var(--accent)" : "var(--text)",
                          border:"none", cursor:"pointer", fontSize:13,
                          fontFamily:"'DM Sans', sans-serif",
                          borderBottom:"1px solid rgba(30,30,46,0.6)",
                          display:"flex", alignItems:"center", gap:8,
                          transition:"background 0.15s",
                        }}
                      >
                        <Bot size={13} style={{ flexShrink:0, color:"var(--muted)" }} />
                        {agent.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date from */}
              <div>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:6 }}>DESDE</label>
                <div style={{ position:"relative" }}>
                  <Calendar size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--muted)", pointerEvents:"none" }} />
                  <input className="input" type="date" value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{ paddingLeft:34 }}
                  />
                </div>
              </div>

              {/* Date to */}
              <div>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:6 }}>HASTA</label>
                <div style={{ position:"relative" }}>
                  <Calendar size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--muted)", pointerEvents:"none" }} />
                  <input className="input" type="date" value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{ paddingLeft:34 }}
                  />
                </div>
              </div>

              <button className="btn-primary" onClick={loadConversations} disabled={loadingConvs || !selectedAgent}
                style={{ display:"flex", alignItems:"center", gap:8, whiteSpace:"nowrap" }}>
                {loadingConvs ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}
                {loadingConvs ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="fade-up" style={{ padding:"12px 16px", background:"rgba(255,101,132,0.08)", border:"1px solid rgba(255,101,132,0.2)", borderRadius:8, color:"var(--accent2)", fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
            <XCircle size={14} /> {error}
          </div>
        )}

        {/* Stats */}
        {fetched && conversations.length > 0 && (
          <div className="fade-up" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {[
              { icon:<MessageSquare size={16}/>, label:"Total", value: conversations.length },
              { icon:<CheckCircle2 size={16}/>, label:"Completadas", value: conversations.filter(c => ["done","completed"].includes(c.status?.toLowerCase())).length },
              { icon:<Clock size={16}/>, label:"Duración media", value: fmt(avgDuration) },
              { icon:<Bot size={16}/>, label:"Seleccionadas", value: selected.size },
            ].map(({ icon, label, value }) => (
              <div key={label} className="card" style={{ padding:"14px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, color:"var(--muted)", fontSize:11, marginBottom:6 }}>
                  {icon} {label.toUpperCase()}
                </div>
                <div className="mono" style={{ fontSize:22, fontWeight:700, color:"var(--accent)" }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Table + Export ──────────────────────────────────────── */}
        {conversations.length > 0 && (
          <div className="card fade-up" style={{ overflow:"hidden" }}>
            <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ accentColor:"var(--accent)", width:15, height:15 }} />
                <span style={{ fontSize:13, color:"var(--muted)" }}>
                  {selected.size} de {conversations.length} seleccionadas
                </span>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {selectedAgent && (
                  <span style={{ fontSize:11, color:"var(--muted)", fontFamily:"monospace" }}>
                    Cola: <strong style={{ color:"var(--text)" }}>{selectedAgent.name}</strong>
                  </span>
                )}
                <button className="btn-success" onClick={exportExcel}
                  disabled={exporting || selected.size === 0}
                  style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {exporting ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
                  {exporting
                    ? `Exportando ${selected.size}...`
                    : `Exportar ${selected.size} a Excel`}
                </button>
              </div>
            </div>

            <div style={{ overflowX:"auto", maxHeight:460, overflowY:"auto" }}>
              <table className="data-table">
                <thead style={{ position:"sticky", top:0, background:"var(--surface)", zIndex:1 }}>
                  <tr>
                    <th style={{ width:40 }}></th>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Cola</th>
                    <th>Duración</th>
                    <th>Mensajes</th>
                    <th>Estado</th>
                    <th>ID Conversación</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map((c) => {
                    const dt = new Date(c.start_time_unix_secs * 1000);
                    return (
                      <tr key={c.conversation_id} style={{ cursor:"pointer" }} onClick={() => toggleSelect(c.conversation_id)}>
                        <td>
                          <input type="checkbox" checked={selected.has(c.conversation_id)}
                            onChange={() => toggleSelect(c.conversation_id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor:"var(--accent)", width:14, height:14 }} />
                        </td>
                        <td className="mono" style={{ fontSize:12 }}>
                          {dt.toLocaleDateString("es-ES", { day:"2-digit", month:"2-digit", year:"numeric" })}
                        </td>
                        <td className="mono" style={{ fontSize:12 }}>
                          {dt.toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" })}
                        </td>
                        <td style={{ fontSize:12, color:"var(--muted)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {selectedAgent?.name}
                        </td>
                        <td className="mono" style={{ fontSize:12 }}>{fmt(c.call_duration_secs)}</td>
                        <td>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <MessageSquare size={12} style={{ color:"var(--muted)" }} />
                            <span className="mono" style={{ fontSize:12 }}>{c.message_count}</span>
                          </div>
                        </td>
                        <td><StatusTag status={c.status} /></td>
                        <td className="mono" style={{ fontSize:10, color:"var(--muted)" }}>
                          {c.conversation_id.slice(0, 24)}…
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty / initial states */}
        {fetched && conversations.length === 0 && !loadingConvs && (
          <div className="card fade-up" style={{ padding:48, textAlign:"center", color:"var(--muted)" }}>
            <MessageSquare size={32} style={{ margin:"0 auto 12px", opacity:0.3 }} />
            <div style={{ fontSize:14 }}>No hay conversaciones en ese rango de fechas.</div>
            <div style={{ fontSize:12, marginTop:4 }}>Prueba con un periodo más amplio.</div>
          </div>
        )}

        {!fetched && !loadingAgents && !loadingConvs && agents.length === 0 && (
          <div className="card fade-up" style={{ padding:48, textAlign:"center", color:"var(--muted)" }}>
            <Bot size={32} style={{ margin:"0 auto 12px", opacity:0.3 }} />
            <div style={{ fontSize:14 }}>Introduce tu API Key y carga tus agentes para empezar.</div>
          </div>
        )}

      </main>

      <footer style={{ borderTop:"1px solid var(--border)", padding:"16px 24px", textAlign:"center", fontSize:11, color:"var(--muted)", marginTop:32 }}>
        <span className="mono">ElevenLabs Exporter</span> · Las credenciales nunca se almacenan en servidor
      </footer>
    </div>
  );
}
