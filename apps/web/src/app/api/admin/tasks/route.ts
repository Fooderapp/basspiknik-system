import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const taskSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  platform: z.enum(["internal", "facebook", "instagram", "tiktok", "google", "youtube", "other"]),
  url: z.string().url().optional().or(z.literal("")).nullable(),
  ctaLabel: z.string().min(1).max(40),
  rewardCredits: z.coerce.number().int().min(0).max(10000),
  repeatable: z.boolean(),
  cooldownHours: z.coerce.number().int().min(0).max(8760),
  requiresReview: z.boolean(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

async function requireAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "ADMIN" ? profile : null;
}

function toRow(d: z.infer<typeof taskSchema>) {
  return {
    title: d.title,
    description: d.description || null,
    platform: d.platform,
    url: d.url || null,
    cta_label: d.ctaLabel,
    reward_credits: d.rewardCredits,
    repeatable: d.repeatable,
    cooldown_hours: d.cooldownHours,
    requires_review: d.requiresReview,
    active: d.active,
    sort_order: d.sortOrder,
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;
  const [{ data: tasks }, { data: pending }] = await Promise.all([
    admin.from("credit_tasks").select("*").order("sort_order").order("created_at"),
    admin
      .from("credit_task_completions")
      .select("id, task_id, user_id, status, proof_url, created_at, credit_tasks(title, reward_credits), profiles(name, email)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true }),
  ]);
  return NextResponse.json({ tasks: tasks ?? [], pending: pending ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = taskSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin.from("credit_tasks").insert(toRow(parsed.data)).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin.from("credit_tasks").update(toRow(parsed.data)).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { error } = await admin.from("credit_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
