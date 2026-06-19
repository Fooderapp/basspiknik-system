import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android"]),
});

export async function POST(req: Request) {
  const admin = createAdminClient() as any;

  // The mobile app authenticates with a Bearer token (no cookies). Resolve the
  // user from the Authorization header first; fall back to the cookie session
  // (web) if no header is present.
  let userId: string | null = null;
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (!error && data?.user) userId = data.user.id;
  } else {
    const supabase = await createClient() as any;
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const { error } = await admin.from("push_tokens").upsert(
    { user_id: userId, token: parsed.data.token, platform: parsed.data.platform },
    { onConflict: "user_id,token" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
