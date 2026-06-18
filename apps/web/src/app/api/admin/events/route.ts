import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireEditor() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

export async function GET() {
  if (!(await requireEditor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("events")
    .select("id, name, slug, start_date, status")
    .order("start_date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
