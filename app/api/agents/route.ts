// app/api/agents/route.ts
import { NextResponse } from "next/server";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export async function GET() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Variable de entorno ELEVENLABS_API_KEY no configurada en Vercel" },
        { status: 500 }
      );
    }

    const all: { agent_id: string; name: string }[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${ELEVENLABS_BASE}/convai/agents?${params}`, {
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          { error: `ElevenLabs API error ${res.status}: ${err}` },
          { status: res.status }
        );
      }

      const raw = await res.json();

      // Log raw response for debugging (visible in Vercel function logs)
      console.log(`[agents] page ${page} raw keys:`, Object.keys(raw));
      console.log(`[agents] page ${page} data:`, JSON.stringify(raw).slice(0, 500));

      // Handle different possible response shapes from ElevenLabs
      let pageAgents: { agent_id: string; name: string }[] = [];

      if (Array.isArray(raw)) {
        // Direct array response
        pageAgents = raw;
        cursor = undefined;
      } else if (Array.isArray(raw.agents)) {
        // { agents: [...], has_more, next_cursor }
        pageAgents = raw.agents;
        cursor = raw.has_more && raw.next_cursor ? raw.next_cursor : undefined;
      } else if (Array.isArray(raw.items)) {
        // { items: [...] }
        pageAgents = raw.items;
        cursor = raw.has_more && raw.next_cursor ? raw.next_cursor : undefined;
      } else {
        // Unknown shape — return raw for debugging
        return NextResponse.json({ agents: [], debug: raw });
      }

      all.push(...pageAgents);

      // Safety: max 10 pages
      if (page >= 10) break;

    } while (cursor);

    return NextResponse.json({ agents: all, total: all.length });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[agents] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
