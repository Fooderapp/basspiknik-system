import Stripe from "stripe";
import { getConfig } from "@/lib/config";

/**
 * Lazy Stripe client. The secret key resolves from system_config (DB) with env
 * fallback, so it's manageable from the admin dashboard. Cached per secret and
 * rebuilt if the key changes.
 */
let cached: { key: string; client: Stripe } | null = null;

export async function getStripe(): Promise<Stripe> {
  const key = await getConfig("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured (admin → settings or env).");
  if (cached?.key === key) return cached.client;
  const client = new Stripe(key, { apiVersion: "2025-02-24.acacia", typescript: true });
  cached = { key, client };
  return client;
}

export function formatStripeAmount(amount: number): number {
  return Math.round(amount * 100);
}

export function parseStripeAmount(amount: number): number {
  return amount / 100;
}
