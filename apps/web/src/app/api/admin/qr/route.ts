import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  type: z.enum(["ONE_TIME_CREDIT", "OPEN_EVENT", "LINK", "MESSAGE"]),
  label: z.string().max(120).optional().nullable(),
  creditAmount: z.coerce.number().int().min(0).max(100000).default(0),
  eventId: z.string().uuid().optional().nullable(),
  url: z.string().url().optional().or(z.literal("")).nullable(),
  message: z.string().max(500).optional().nullable(),
  maxUses: z.coerce.number().int().min(0).max(1000000).default(0),
  perUserOnce: z.boolean().default(true),
});

async function requireAdmin() {
  const profile = await getCurrentProfile();
  return profile && ["ADMIN", "EDITOR"].includes(profile.role) ? profile : null;
}

function randomCode(): string {
  // URL-safe, no ambiguous chars
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin
    .from("qr_codes")
    .select("*, events(name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(req: Request) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const d = parsed.data;

  if (d.type === "ONE_TIME_CREDIT" && d.creditAmount <= 0)
    return NextResponse.json({ error: "Credit amount required" }, { status: 400 });
  if (d.type === "OPEN_EVENT" && !d.eventId)
    return NextResponse.json({ error: "Event required" }, { status: 400 });
  if (d.type === "LINK" && !d.url)
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  if (d.type === "MESSAGE" && !d.message)
    return NextResponse.json({ error: "Message required" }, { status: 400 });

  const admin = await createAdminClient() as any;
  const row = {
    code: randomCode(),
    type: d.type,
    label: d.label || null,
    credit_amount: d.type === "ONE_TIME_CREDIT" ? d.creditAmount : 0,
    event_id: d.type === "OPEN_EVENT" ? d.eventId : null,
    url: d.type === "LINK" ? (d.url || null) : null,
    message: d.type === "MESSAGE" ? (d.message || null) : null,
    max_uses: d.maxUses,
    per_user_once: d.perUserOnce,
    created_by: profile.id,
  };
  const { data, error } = await admin.from("qr_codes").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { error } = await admin.from("qr_codes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
