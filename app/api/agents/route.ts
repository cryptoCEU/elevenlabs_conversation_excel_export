// app/api/agents/route.ts
import { NextResponse } from "next/server";
import { fetchAgents } from "@/lib/elevenlabs";

export async function GET() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Variable de entorno ELEVENLABS_API_KEY no configurada en Vercel" },
        { status: 500 }
      );
    }
    const agents = await fetchAgents(apiKey);
    return NextResponse.json({ agents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
