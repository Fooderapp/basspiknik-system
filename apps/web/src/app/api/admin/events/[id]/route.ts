import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { sendOnSaleNotifications } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireEditor() {
  const p = await getCurrentProfile();
  return p && ["ADMIN", "EDITOR"].includes(p.role) ? p : null;
}

/** POST /api/admin/events/[id]/notify — manually trigger on-sale notifications */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient() as any;

  const { data: event } = await admin.from("events").select("id, name, slug").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sendOnSaleNotifications(event.id, event.name, event.slug);
  return NextResponse.json({ ok: true });
}
