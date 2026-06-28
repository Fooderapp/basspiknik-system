import { createClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Pure service-role client — NO cookies/session, so requests always run as
 * `service_role` and bypass RLS. (createAdminClient from supabase/ssr attaches
 * the caller's auth cookie, which downgrades to `authenticated` and is blocked
 * by system_config's RLS.)
 */
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Runtime system configuration with DB-first, env-fallback resolution.
 *
 * Values live in the `system_config` table (service-role only) so an admin can
 * edit Stripe / Billingo / Resend / public-URL keys from the dashboard instead
 * of Vercel. If a key is unset in the DB we fall back to `process.env[key]`,
 * so existing env vars keep working and bootstrap secrets stay in Vercel.
 *
 * A short in-memory cache avoids a DB round-trip on every Stripe/email call.
 * Each serverless instance caches independently; setConfig() clears it locally.
 */

/** Keys the admin dashboard manages. `secret` masks the value in the UI. */
export const CONFIG_KEYS = [
  { key: "STRIPE_SECRET_KEY", group: "Stripe", label: "Secret key", secret: true, placeholder: "sk_live_…" },
  { key: "STRIPE_WEBHOOK_SECRET", group: "Stripe", label: "Webhook signing secret", secret: true, placeholder: "whsec_…" },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", group: "Stripe", label: "Publishable key", secret: false, placeholder: "pk_live_…", clientBuild: true },
  { key: "STRIPE_TERMINAL_LOCATION_ID", group: "Stripe", label: "Terminal location ID", secret: false, placeholder: "tml_…" },
  { key: "STRIPE_SIMULATED", group: "Stripe", label: "Simulated Terminal (testing)", secret: false, placeholder: "true / false" },
  { key: "BILLINGO_API_KEY", group: "Billingo", label: "API key", secret: true },
  { key: "BILLINGO_BLOCK_ID", group: "Billingo", label: "Invoice block ID (számla)", secret: false },
  { key: "BILLINGO_RECEIPT_BLOCK_ID", group: "Billingo", label: "Receipt block ID (nyugta)", secret: false, placeholder: "receipt-type block" },
  { key: "BILLINGO_BANK_ACCOUNT_ID", group: "Billingo", label: "Bank account ID", secret: false },
  { key: "BILLINGO_VAT", group: "Billingo", label: "VAT rate", secret: false, placeholder: "27%" },
  { key: "BILLINGO_PAYMENT_METHOD", group: "Billingo", label: "Payment method", secret: false, placeholder: "online_bankcard" },
  { key: "RESEND_API_KEY", group: "Resend", label: "API key", secret: true, placeholder: "re_…" },
  { key: "RESEND_FROM", group: "Resend", label: "From address", secret: false, placeholder: "Bass Piknik <tickets@mail.basspiknik.com>" },
  { key: "NEXT_PUBLIC_APP_URL", group: "General", label: "Public app URL", secret: false, placeholder: "https://basspiknik.com", clientBuild: true },
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number]["key"];

const TTL_MS = 30_000;
let cache: { values: Record<string, string | null>; at: number } | null = null;

async function loadAll(): Promise<Record<string, string | null>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  try {
    const sb = serviceClient() as any;
    const { data } = await sb.from("system_config").select("key, value");
    const values: Record<string, string | null> = {};
    for (const row of data ?? []) values[row.key] = row.value;
    cache = { values, at: Date.now() };
    return values;
  } catch {
    // Table missing / DB down → fall back to whatever we last had, then env.
    return cache?.values ?? {};
  }
}

/** DB value if set+non-empty, else the env var, else undefined. */
export async function getConfig(key: string): Promise<string | undefined> {
  const all = await loadAll();
  const v = all[key];
  if (v != null && v !== "") return v;
  return process.env[key] || undefined;
}

/** Clear the in-memory cache (call after a write). */
export function invalidateConfigCache() {
  cache = null;
}

/** Upsert a config value (null/"" → unset, falls back to env). Throws on failure
 *  (e.g. the system_config table/migration is missing) so the UI can report it. */
export async function setConfig(key: string, value: string | null): Promise<void> {
  const sb = serviceClient() as any;
  const { error } = await sb
    .from("system_config")
    .upsert({ key, value: value && value.length ? value : null, updated_at: new Date().toISOString() });
  if (error) {
    throw new Error(
      `Could not save "${key}": ${error.message}. ` +
      `Has migration 026_system_config.sql been run (+ PostgREST schema reloaded)?`,
    );
  }
  invalidateConfigCache();
}

/** For the admin UI: each key with whether it's set and where (db vs env). */
export async function getConfigStatus() {
  const all = await loadAll();
  return CONFIG_KEYS.map((k) => {
    const dbVal = all[k.key];
    const envVal = process.env[k.key];
    const effective = (dbVal != null && dbVal !== "") ? dbVal : (envVal || "");
    return {
      key: k.key,
      group: k.group,
      label: k.label,
      secret: k.secret,
      placeholder: (k as any).placeholder ?? "",
      clientBuild: (k as any).clientBuild ?? false,
      source: dbVal != null && dbVal !== "" ? "db" : envVal ? "env" : "unset",
      isSet: !!effective,
      // Never leak full secrets: mask to last 4 chars.
      preview: effective
        ? (k.secret ? `••••${effective.slice(-4)}` : effective)
        : "",
    };
  });
}
