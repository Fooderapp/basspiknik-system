import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve user from Bearer token (mobile) or cookie session (web). */
async function resolveUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const sb = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user } } = await sb.auth.getUser(token);
    return user ?? null;
  }
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

// Current user's credit balance + global credit settings (for the cart UI).
// Accepts Bearer token (mobile) or cookie session (web).
export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ balance: 0, enabled: false });

  const admin = await createAdminClient() as any;
  const [{ data: balance }, { data: settings }] = await Promise.all([
    admin.rpc("get_credit_balance", { p_user_id: user.id }),
    admin
      .from("app_settings")
      .select("credits_enabled, spin_cost, spin_win_rate")
      .eq("id", "global")
      .single(),
  ]);

  return NextResponse.json({
    balance: balance ?? 0,
    enabled: settings?.credits_enabled ?? false,
    spinCost: settings?.spin_cost ?? 4,
    winRate: settings?.spin_win_rate ?? 20,
  });
}
