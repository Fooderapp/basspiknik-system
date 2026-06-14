import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  imageUrl: z.string().url(),
  caption: z.string().max(200).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

async function requireAdmin() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin.from("gallery_images").select("*").order("sort_order").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ images: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin.from("gallery_images")
    .insert({ image_url: parsed.data.imageUrl, caption: parsed.data.caption || null, sort_order: parsed.data.sortOrder ?? 0 })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ image: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { error } = await admin.from("gallery_images").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
