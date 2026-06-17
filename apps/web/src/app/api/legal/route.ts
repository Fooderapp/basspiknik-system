import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const VALID_SLUGS = ["privacy-policy", "aszf", "impresszum"];

export async function POST(req: Request) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { slug, title_hu, title_en, content_hu, content_en } = body;

  if (!VALID_SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const supabase = await createClient() as any;
  const { error } = await supabase.from("legal_pages").upsert({
    slug, title_hu, title_en, content_hu, content_en, updated_at: new Date().toISOString(),
  }, { onConflict: "slug" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
