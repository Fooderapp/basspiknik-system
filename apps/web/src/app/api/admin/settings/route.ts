import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  currency: z.enum(["EUR", "USD", "HUF"]),
  language: z.enum(["en", "hu"]),
});

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createAdminClient() as any;
  const { data, error } = await supabase
    .from("app_settings")
    .select("currency, language, updated_at")
    .eq("id", "global")
    .single();

  if (error || !data)
    return NextResponse.json({ currency: "EUR", language: "en" });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = await createAdminClient() as any;
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      id: "global",
      ...parsed.data,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
