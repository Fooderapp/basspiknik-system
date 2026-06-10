import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve a user-scoped Supabase client (cookie on web, Bearer on mobile) so
 *  RLS lets the caller read active tasks + their own completions. */
async function userClient(req: Request): Promise<any> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    return createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
  }
  return await createClient();
}

/** List active tasks with this user's completion state (done / pending / when). */
export async function GET(req: Request) {
  const sb = await userClient(req);
  const { data: { user } } = await sb.auth.getUser();

  const { data: tasks } = await sb
    .from("credit_tasks")
    .select("id, title, description, platform, url, cta_label, reward_credits, repeatable, cooldown_hours, requires_review, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  let completions: any[] = [];
  if (user) {
    const { data } = await sb
      .from("credit_task_completions")
      .select("task_id, status, created_at")
      .eq("user_id", user.id);
    completions = data ?? [];
  }

  const now = Date.now();
  const list = (tasks ?? []).map((t: any) => {
    const mine = completions.filter((c) => c.task_id === t.id);
    const approved = mine.some((c) => c.status === "APPROVED");
    const pending = mine.some((c) => c.status === "PENDING");
    const last = mine.length ? Math.max(...mine.map((c) => new Date(c.created_at).getTime())) : 0;
    const cooldownLeft = t.repeatable && t.cooldown_hours > 0 && last
      ? Math.max(0, last + t.cooldown_hours * 3600_000 - now)
      : 0;

    // State: done (one-time approved), pending (awaiting review), cooldown, or available
    let state: "available" | "done" | "pending" | "cooldown" = "available";
    if (pending) state = "pending";
    else if (!t.repeatable && approved) state = "done";
    else if (cooldownLeft > 0) state = "cooldown";

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      platform: t.platform,
      url: t.url,
      ctaLabel: t.cta_label,
      reward: t.reward_credits,
      repeatable: t.repeatable,
      requiresReview: t.requires_review,
      state,
      cooldownLeftMs: cooldownLeft,
    };
  });

  return NextResponse.json({ tasks: list });
}
