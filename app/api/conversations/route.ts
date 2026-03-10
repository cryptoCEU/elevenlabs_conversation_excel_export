// app/api/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchConversationsInRange } from "@/lib/elevenlabs";

export async function POST(req: NextRequest) {
  try {
    const { apiKey, agentId, dateFrom, dateTo } = await req.json();

    if (!apiKey || !agentId) {
      return NextResponse.json(
        { error: "Se requieren apiKey y agentId" },
        { status: 400 }
      );
    }

    // dateFrom / dateTo are ISO date strings "YYYY-MM-DD"
    const fromUnix = dateFrom
      ? Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000)
      : undefined;
    const toUnix = dateTo
      ? Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000)
      : undefined;

    const conversations = await fetchConversationsInRange(
      apiKey,
      agentId,
      fromUnix,
      toUnix
    );

    return NextResponse.json({ conversations, total: conversations.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
