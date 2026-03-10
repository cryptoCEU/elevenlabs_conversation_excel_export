// app/api/agents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchAgents } from "@/lib/elevenlabs";

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();
    if (!apiKey) {
      return NextResponse.json({ error: "Se requiere apiKey" }, { status: 400 });
    }
    const agents = await fetchAgents(apiKey);
    return NextResponse.json({ agents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
