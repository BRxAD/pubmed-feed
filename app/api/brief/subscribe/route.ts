import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Valid email required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("brief_subscribers")
      .upsert({ email }, { onConflict: "email" });

    if (error) {
      if (
        error.message.toLowerCase().includes("brief_subscribers") ||
        error.code === "42P01"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Signup storage not ready — run scripts/add_brief_subscribers.sql in Supabase.",
          },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("SUPABASE")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Server configuration incomplete — contact the site admin.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
