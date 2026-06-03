import { NextResponse } from "next/server";
import { summarizeAbstract } from "@/lib/summarize";

const SAMPLE_ABSTRACT =
  "We conducted a randomized controlled trial of 200 patients with hypertension to compare metformin versus placebo on blood pressure. Participants received 500 mg twice daily for 12 weeks. Metformin significantly reduced systolic BP by 8 mmHg (p<0.001) versus placebo.";

export async function GET() {
  try {
    const summary = await summarizeAbstract(SAMPLE_ABSTRACT);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
