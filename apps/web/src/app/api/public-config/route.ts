import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

/**
 * GET /api/public-config — PUBLIC, unauthenticated.
 *
 * Serves the non-secret client config (Stripe *publishable* key + public app
 * URL) resolved DB-first → env fallback, so the mobile app can pick them up at
 * runtime instead of having them baked in at build time. The publishable key is
 * designed to be exposed in clients, so this is safe.
 *
 * The SECRET key and webhook secret are NEVER served here.
 */
export async function GET() {
  const [stripePublishableKey, appUrl] = await Promise.all([
    getConfig("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    getConfig("NEXT_PUBLIC_APP_URL"),
  ]);

  return NextResponse.json(
    {
      stripePublishableKey: stripePublishableKey ?? null,
      appUrl: appUrl ?? null,
    },
    {
      headers: {
        // Public data — safe to cache briefly + allow cross-origin reads.
        "Cache-Control": "public, max-age=60, s-maxage=60",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
