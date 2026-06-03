import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data: topics, error } = await supabase
      .from("topics")
      .select("id, name, query_string")
      .limit(5);

    if (error) throw error;

    return NextResponse.json({ ok: true, topics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
