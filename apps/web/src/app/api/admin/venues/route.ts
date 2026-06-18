import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  name: z.string().min(1).max(200),
  lat: z.number(),
  lng: z.number(),
  maps_url: z.string().max(1000).optional().default(""),
  description_hu: z.string().max(5000).optional().default(""),
  description_en: z.string().max(5000).optional().default(""),
  images: z.array(z.string().url()).optional().default([]),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

async function requireEditor() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

export async function GET() {
  if (!(await requireEditor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin.from("map_venues").select("*").order("sort_order").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ venues: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireEditor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
  const admin = await createAdminClient() as any;
  const { data, error } = await admin.from("map_venues").insert(parsed.data).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ venue: data });
}
