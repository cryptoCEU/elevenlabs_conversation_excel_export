// app/api/agent-codes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/agent-codes → { [agent_id]: code }
export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("agent_codes").select("agent_id, code");
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.agent_id] = row.code;
    return NextResponse.json(map);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/agent-codes { agent_id, code } → upsert
export async function POST(req: NextRequest) {
  try {
    const { agent_id, code } = await req.json();
    if (!agent_id) return NextResponse.json({ error: "agent_id required" }, { status: 400 });
    const sb = getSupabase();
    const { error } = await sb.from("agent_codes").upsert(
      { agent_id, code: code ?? "", updated_at: new Date().toISOString() },
      { onConflict: "agent_id" }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ agent_id, code });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
