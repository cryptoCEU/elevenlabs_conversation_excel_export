"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error ?? "Error al iniciar sesión.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Jost', sans-serif",
    }}>
      {/* Subtle background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: "radial-gradient(ellipse at 30% 40%, rgba(140,23,54,0.05) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(200,180,154,0.1) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 380,
        padding: "0 24px",
      }}>
        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src="/logo.svg" alt="Activum" style={{ height: 64, width: "auto", marginBottom: 20 }} />
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", fontFamily: "'Playfair Display', serif", letterSpacing: "0.01em" }}>
            Agente IA Dashboard
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Conversaciones · ElevenLabs
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: 32,
          boxShadow: "0 4px 24px rgba(30,29,22,0.07)",
        }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Usuario
              </label>
              <input
                className="input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="usuario"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Contraseña
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(140,23,54,0.06)",
                border: "1px solid rgba(140,23,54,0.2)",
                borderRadius: 2,
                fontSize: 12,
                color: "var(--error)",
              }}>
                {error}
              </div>
            )}

            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
              style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 24px" }}
            >
              {loading
                ? <><Loader2 size={14} className="spinner" /> Entrando...</>
                : <><LogIn size={14} /> Iniciar sesión</>
              }
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "var(--muted)" }}>
          Activum · Uso interno
        </div>
      </div>
    </div>
  );
}
