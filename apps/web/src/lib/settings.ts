import { createAdminClient } from "@/lib/supabase/server";

export type Currency = "EUR" | "USD" | "HUF";
export type Language = "en" | "hu";

export interface AppSettings {
  currency: Currency;
  language: Language;
}

const DEFAULTS: AppSettings = { currency: "EUR", language: "en" };

/** Read app settings. Falls back to defaults if the row doesn't exist yet.
 *  Uses the admin client so it works in API routes (bypasses RLS). */
export async function getSettings(): Promise<AppSettings> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = await createAdminClient() as any;
    const { data } = await supabase
      .from("app_settings")
      .select("currency, language")
      .eq("id", "global")
      .single();
    if (!data) return DEFAULTS;
    return {
      currency: (data.currency ?? "EUR") as Currency,
      language: (data.language ?? "en") as Language,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Zero-decimal currencies — Stripe wants the amount as-is (no × 100).
 *  HUF is NOT zero-decimal in Stripe — it uses fillér (×100) like EUR/USD. */
const ZERO_DECIMAL: Currency[] = [];

export function isZeroDecimal(currency: Currency): boolean {
  return ZERO_DECIMAL.includes(currency);
}

/** Convert a DB price to the Stripe unit_amount for the given currency. */
export function toStripeAmount(amount: number, currency: Currency): number {
  return isZeroDecimal(currency) ? Math.round(amount) : Math.round(amount * 100);
}

/** Convert a Stripe amount_total back to a display number. */
export function fromStripeAmount(amount: number, currency: Currency): number {
  return isZeroDecimal(currency) ? amount : amount / 100;
}
