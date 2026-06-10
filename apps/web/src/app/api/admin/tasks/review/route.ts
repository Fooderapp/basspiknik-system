import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  completionId: z.string(),
  approve: z.boolean(),
});

/** Approve (→ grant) or reject (→ clawback) a pending task completion.
 *  Runs review_task_completion() as the admin (cookie session → auth.uid()). */
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "EDITOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const sb = await createClient() as any;
  const { data, error } = await sb.rpc("review_task_completion", {
    p_completion_id: parsed.data.completionId,
    p_approve: parsed.data.approve,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json(data);
}
