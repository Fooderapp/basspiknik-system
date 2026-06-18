import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "lowercase, numbers, dashes"),
  genre: z.string().max(80).optional().nullable(),
  bio: z.string().max(4000).optional().nullable(),
  photoUrl: z.string().url().optional().or(z.literal("")).nullable(),
  socials: z.record(z.string(), z.string()).optional(),
  featured: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
  eventIds: z.array(z.string().uuid()).optional(),
});

async function requireAdmin() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

function toRow(d: z.infer<typeof schema>) {
  return {
    name: d.name, slug: d.slug, genre: d.genre || null, bio: d.bio || null,
    photo_url: d.photoUrl || null, socials: d.socials ?? {},
    featured: d.featured ?? false, sort_order: d.sortOrder ?? 0, active: d.active ?? true,
    event_ids: d.eventIds ?? [],
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient() as any;
  const { data, error } = await admin.from("artists").select("*").order("sort_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artists: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const admin = createAdminClient() as any;
  const row = toRow(parsed.data);
  const q = parsed.data.id
    ? admin.from("artists").update(row).eq("id", parsed.data.id).select("*").single()
    : admin.from("artists").insert(row).select("*").single();
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artist: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient() as any;
  const { error } = await admin.from("artists").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
