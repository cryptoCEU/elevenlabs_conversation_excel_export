// app/api/debug/route.ts — temporal para inspeccionar respuesta real de ElevenLabs
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const { conversationId } = await req.json();
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": apiKey },
  });
  const raw = await res.json();
  // Return full raw response so we can see all field names
  return NextResponse.json(raw);
}
