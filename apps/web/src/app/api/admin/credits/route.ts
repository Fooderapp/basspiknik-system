import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireAdmin() {
  const p = await getCurrentProfile();
  return p?.role === "ADMIN" ? p : null;
}

const grantSchema = z.object({
  lookupType: z.enum(["email", "pass_id"]),
  lookup: z.string().min(1),
  amount: z.number().int().min(-100000).max(100000),
  note: z.string().max(500).optional().default(""),
});

/** GET  /api/admin/credits — recent ADJUST transactions with user info */
export async function GET() {
  const admin_profile = await requireAdmin();
  if (!admin_profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;

  const { data, error } = await admin
    .from("credit_transactions")
    .select("id, user_id, amount, meta, created_at, profiles(id, name, email)")
    .eq("reason", "ADJUST")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grants: data ?? [] });
}

/** POST /api/admin/credits — look up user + grant/deduct credits */
export async function POST(req: Request) {
  const admin_profile = await requireAdmin();
  if (!admin_profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await createAdminClient() as any;

  const parsed = grantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { lookupType, lookup, amount, note } = parsed.data;

  // ── Resolve user_id ───────────────────────────────────────────────────────
  let userId: string | null = null;
  let userName = "";
  let userEmail = "";

  if (lookupType === "email") {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, name, email")
      .ilike("email", lookup.trim())
      .single();
    if (profile) { userId = profile.id; userName = profile.name; userEmail = profile.email; }
  } else {
    // pass_id → tickets.wallet_pass_id → order → user
    const { data: ticket } = await admin
      .from("tickets")
      .select("order_id, orders(user_id, profiles(id, name, email))")
      .eq("wallet_pass_id", lookup.trim())
      .single();
    const profile = (ticket as any)?.orders?.profiles;
    if (profile) {
      userId = profile.id;
      userName = profile.name;
      userEmail = profile.email;
    }
  }

  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // ── Current balance ───────────────────────────────────────────────────────
  const { data: txns } = await admin
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId);
  const balanceBefore = (txns ?? []).reduce((s: number, t: any) => s + t.amount, 0);

  // ── Insert ADJUST transaction ─────────────────────────────────────────────
  const { error: insertErr } = await admin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    reason: "ADJUST",
    meta: { note, granted_by: admin_profile.email },
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({
    user: { id: userId, name: userName, email: userEmail },
    balanceBefore,
    balanceAfter: balanceBefore + amount,
    amount,
  });
}
