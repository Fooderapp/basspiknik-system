import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  currency: z.enum(["EUR", "USD", "HUF"]),
  language: z.enum(["en", "hu"]),
  creditsEnabled: z.boolean().optional(),
  creditsPerTicket: z.coerce.number().int().min(0).max(1000).optional(),
  creditsPerDrink: z.coerce.number().int().min(0).max(1000).optional(),
  spinCost: z.coerce.number().int().min(1).max(1000).optional(),
  spinWinRate: z.coerce.number().int().min(1).max(100000).optional(),
  invoicePosCash: z.boolean().optional(),
  creditRedeemEnabled: z.boolean().optional(),
  creditValueHuf: z.coerce.number().min(0).max(100000).optional(),
  creditMaxApply: z.coerce.number().int().min(0).max(1000000).optional(),
  creditMaxPct: z.coerce.number().int().min(0).max(100).optional(),
  creditMinRedeem: z.coerce.number().int().min(0).max(1000000).optional(),
});

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createAdminClient() as any;
  const { data, error } = await supabase
    .from("app_settings")
    .select("currency, language, credits_enabled, credits_per_ticket, credits_per_drink, spin_cost, spin_win_rate, invoice_pos_cash, credit_redeem_enabled, credit_value_huf, credit_max_apply, credit_max_pct, credit_min_redeem, updated_at")
    .eq("id", "global")
    .single();

  if (error || !data)
    return NextResponse.json({ currency: "HUF", language: "hu" });

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

  const d = parsed.data;
  const update: Record<string, any> = {
    currency: d.currency,
    language: d.language,
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  };
  if (d.creditsEnabled   !== undefined) update.credits_enabled    = d.creditsEnabled;
  if (d.creditsPerTicket !== undefined) update.credits_per_ticket = d.creditsPerTicket;
  if (d.creditsPerDrink  !== undefined) update.credits_per_drink  = d.creditsPerDrink;
  if (d.spinCost         !== undefined) update.spin_cost          = d.spinCost;
  if (d.spinWinRate      !== undefined) update.spin_win_rate      = d.spinWinRate;
  if (d.invoicePosCash   !== undefined) update.invoice_pos_cash   = d.invoicePosCash;
  if (d.creditRedeemEnabled !== undefined) update.credit_redeem_enabled = d.creditRedeemEnabled;
  if (d.creditValueHuf   !== undefined) update.credit_value_huf   = d.creditValueHuf;
  if (d.creditMaxApply   !== undefined) update.credit_max_apply   = d.creditMaxApply;
  if (d.creditMaxPct     !== undefined) update.credit_max_pct     = d.creditMaxPct;
  if (d.creditMinRedeem  !== undefined) update.credit_min_redeem  = d.creditMinRedeem;

  const supabase = await createAdminClient() as any;
  const { error } = await supabase
    .from("app_settings")
    .update(update)
    .eq("id", "global");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
