// app/api/conversation-detail/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${params.id}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `ElevenLabs ${res.status}: ${text}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
