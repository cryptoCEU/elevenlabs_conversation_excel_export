// app/api/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchConversationsInRange } from "@/lib/elevenlabs";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Variable de entorno ELEVENLABS_API_KEY no configurada en Vercel" },
        { status: 500 }
      );
    }

    const { agentId, dateFrom, dateTo } = await req.json();

    if (!agentId) {
      return NextResponse.json({ error: "Se requiere agentId" }, { status: 400 });
    }

    const fromUnix = dateFrom
      ? Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000)
      : undefined;
    const toUnix = dateTo
      ? Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000)
      : undefined;

    const conversations = await fetchConversationsInRange(apiKey, agentId, fromUnix, toUnix);

    // Debug: log first item from list to see available fields for phone detection
    if (conversations.length > 0) {
      const s = conversations[0] as unknown as Record<string, unknown>;
      console.log("[conversations list] first item keys:", Object.keys(s));
      console.log("[conversations list] phone fields:", JSON.stringify({
        user_id: s.user_id,
        caller_phone: s.caller_phone,
        called_phone: s.called_phone,
        metadata_keys: s.metadata ? Object.keys(s.metadata as object) : [],
      }));
    }

    return NextResponse.json({ conversations, total: conversations.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
