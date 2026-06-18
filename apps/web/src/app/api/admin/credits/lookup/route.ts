import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  lookupType: z.enum(["email", "pass_id"]),
  lookup: z.string().min(1),
});

export async function POST(req: Request) {
  const p = await getCurrentProfile();
  if (p?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { lookupType, lookup } = parsed.data;
  const admin = await createAdminClient() as any;

  let userId: string | null = null;
  let userName = "";
  let userEmail = "";

  if (lookupType === "email") {
    const { data } = await admin
      .from("profiles")
      .select("id, name, email")
      .ilike("email", lookup.trim())
      .single();
    if (data) { userId = data.id; userName = data.name; userEmail = data.email; }
  } else {
    const { data: ticket } = await admin
      .from("tickets")
      .select("orders(user_id, profiles(id, name, email))")
      .eq("wallet_pass_id", lookup.trim())
      .single();
    const profile = (ticket as any)?.orders?.profiles;
    if (profile) { userId = profile.id; userName = profile.name; userEmail = profile.email; }
  }

  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: txns } = await admin
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId);
  const balance = (txns ?? []).reduce((s: number, t: any) => s + t.amount, 0);

  return NextResponse.json({ user: { id: userId, name: userName, email: userEmail, balance } });
}
