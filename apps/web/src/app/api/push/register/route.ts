import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android"]),
});

export async function POST(req: Request) {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const admin = createAdminClient() as any;
  await admin.from("push_tokens").upsert(
    { user_id: user.id, token: parsed.data.token, platform: parsed.data.platform },
    { onConflict: "user_id,token" }
  );

  return NextResponse.json({ ok: true });
}
