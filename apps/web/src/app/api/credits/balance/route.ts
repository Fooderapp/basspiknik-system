import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Current user's credit balance + global credit settings (for the cart UI).
export async function GET() {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ balance: 0, enabled: false });

  const [{ data: balance }, { data: settings }] = await Promise.all([
    supabase.rpc("get_credit_balance", { p_user_id: user.id }),
    supabase
      .from("app_settings")
      .select("credits_enabled, spin_cost, spin_win_rate, credits_per_ticket, credits_per_drink")
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
