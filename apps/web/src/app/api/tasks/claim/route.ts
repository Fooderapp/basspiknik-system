import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  taskId: z.string(),
  proof: z.string().url().optional(),
});

/** Claim a task. Runs the SECURITY DEFINER claim_task() as the signed-in user
 *  (cookie on web, Bearer on mobile). Honor-based: instant grant, or PENDING
 *  when the task requires admin review. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const sb: any = token
    ? createSbClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      )
    : await createClient();

  const { data, error } = await sb.rpc("claim_task", {
    p_task_id: parsed.data.taskId,
    p_proof: parsed.data.proof ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json(data);
}
