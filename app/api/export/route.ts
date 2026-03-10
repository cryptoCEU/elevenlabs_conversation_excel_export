// app/api/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchConversationDetail } from "@/lib/elevenlabs";
import { buildExcelWorkbook, workbookToBuffer } from "@/lib/excel";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Variable de entorno ELEVENLABS_API_KEY no configurada en Vercel" },
        { status: 500 }
      );
    }

    const { agentName, conversationIds } = await req.json();

    if (!conversationIds?.length) {
      return NextResponse.json({ error: "Se requieren conversationIds" }, { status: 400 });
    }

    const BATCH = 5;
    const details = [];
    for (let i = 0; i < conversationIds.length; i += BATCH) {
      const batch = conversationIds.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((id: string) => fetchConversationDetail(apiKey, id))
      );
      details.push(...results);
    }

    const wb = buildExcelWorkbook(details, agentName ?? "Agente");
    const buffer = workbookToBuffer(wb);

    const timestamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="conversaciones_${timestamp}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
