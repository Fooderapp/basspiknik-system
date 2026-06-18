import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Resolve slug → event id, must be PREORDER
  const { data: event } = await admin
    .from("events")
    .select("id, name")
    .eq("slug", slug)
    .eq("status", "PREORDER")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found or not in pre-order" }, { status: 404 });

  // Get user_id if logged in
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await admin.from("event_preorders").upsert({
    event_id: event.id,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name ?? null,
    user_id: user?.id ?? null,
  }, { onConflict: "event_id,email", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
