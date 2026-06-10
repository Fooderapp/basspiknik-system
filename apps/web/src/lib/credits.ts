/* eslint-disable @typescript-eslint/no-explicit-any */

/** Authoritative, server-side credit-redemption calculation used when building
 *  the actual charge (checkout + payment-intent). Mirrors the SQL function
 *  `credit_redeem_quote` (migration 030), which powers the client-side slider
 *  preview. Keep the two in sync.
 *
 *  Given the order total (post-promo, in display units) and the number of
 *  credits the buyer asked to apply, returns the credits that may actually be
 *  applied and the resulting discount — capped by balance, the absolute cap,
 *  the % cap, and the order total itself. */
export interface RedemptionResult {
  enabled: boolean;
  credits: number;   // credits actually applied
  discount: number;  // discount in display currency units
  maxCredits: number;
  balance: number;
  valueHuf: number;
}

export async function computeRedemption(
  admin: any,
  userId: string | null,
  orderTotal: number,
  requested: number | null,
): Promise<RedemptionResult> {
  const off: RedemptionResult = {
    enabled: false, credits: 0, discount: 0, maxCredits: 0, balance: 0, valueHuf: 0,
  };
  if (!userId) return off;

  const { data: s } = await admin
    .from("app_settings")
    .select("credit_redeem_enabled, credit_value_huf, credit_max_apply, credit_max_pct, credit_min_redeem")
    .eq("id", "global")
    .single();

  const enabled = !!s?.credit_redeem_enabled;
  const value = Number(s?.credit_value_huf ?? 0);
  if (!enabled || value <= 0) return off;

  const maxApply = Number(s?.credit_max_apply ?? 0);
  const maxPct = Number(s?.credit_max_pct ?? 0);
  const minRedeem = Number(s?.credit_min_redeem ?? 0);

  // Current balance = sum of the ledger.
  const { data: txns } = await admin
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId);
  const balance = (txns ?? []).reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);

  // Largest credit amount applicable to this order:
  let cap = balance;
  if (maxApply > 0) cap = Math.min(cap, maxApply);
  if (maxPct > 0) cap = Math.min(cap, Math.floor((orderTotal * maxPct / 100) / value));
  cap = Math.min(cap, Math.floor(orderTotal / value)); // never discount past the order
  cap = Math.max(cap, 0);

  let credits = requested == null ? cap : requested;
  credits = Math.max(0, Math.min(credits, cap));
  // minimum redemption threshold: below it, apply nothing
  if (credits > 0 && minRedeem > 0 && credits < minRedeem) credits = 0;

  return {
    enabled: true,
    credits,
    discount: credits * value,
    maxCredits: cap,
    balance,
    valueHuf: value,
  };
}
