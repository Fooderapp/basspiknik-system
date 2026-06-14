import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  heroTitle: z.string().max(200).optional().nullable(),
  heroSubtitle: z.string().max(400).optional().nullable(),
  heroImageUrl: z.string().url().optional().or(z.literal("")).nullable(),
  heroCtaLabel: z.string().max(60).optional().nullable(),
  aboutTitle: z.string().max(200).optional().nullable(),
  aboutBody: z.string().max(4000).optional().nullable(),
  socials: z.record(z.string(), z.string()).optional(),
});

async function requireAdmin() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;
  const { data } = await admin.from("site_content").select("*").eq("id", "home").single();
  return NextResponse.json({ content: data ?? {} });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const d = parsed.data;
  const admin = await createAdminClient() as any;
  const { error } = await admin.from("site_content").update({
    hero_title: d.heroTitle ?? null,
    hero_subtitle: d.heroSubtitle ?? null,
    hero_image_url: d.heroImageUrl || null,
    hero_cta_label: d.heroCtaLabel ?? null,
    about_title: d.aboutTitle ?? null,
    about_body: d.aboutBody ?? null,
    socials: d.socials ?? {},
    updated_at: new Date().toISOString(),
  }).eq("id", "home");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
