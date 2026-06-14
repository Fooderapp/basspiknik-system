import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { getConfig, setConfig } from "@/lib/config";

/**
 * POST /api/terminal/location — seller/admin only.
 *
 * Returns the configured Stripe Terminal location ID. If one isn't stored yet
 * (or if it no longer exists in the current Stripe account), creates a new
 * one automatically and persists the ID in system_config for future calls.
 *
 * This lets POS sellers work without hardcoded env vars — the location is
 * resolved at runtime, so switching Stripe accounts just requires saving a new
 * secret key; no app rebuild needed.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", user.id).single() as any;
    if (!profile || !["ADMIN", "EDITOR", "SELLER"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stripe = await getStripe();

    // 1. Try the stored location ID first.
    const storedId = await getConfig("STRIPE_TERMINAL_LOCATION_ID");
    if (storedId) {
      try {
        const loc = await stripe.terminal.locations.retrieve(storedId);
        if (!loc.deleted) return NextResponse.json({ locationId: loc.id });
      } catch {
        // Location doesn't exist in this account — fall through to create.
      }
    }

    // 2. Check if there's already a location named "Bass Piknik POS" in this account.
    const existing = await stripe.terminal.locations.list({ limit: 100 });
    const match = existing.data.find((l) => l.display_name === "Bass Piknik POS");
    if (match) {
      await setConfig("STRIPE_TERMINAL_LOCATION_ID", match.id);
      return NextResponse.json({ locationId: match.id });
    }

    // 3. Create a new one.
    const created = await stripe.terminal.locations.create({
      display_name: "Bass Piknik POS",
      address: {
        line1: "POS Location",
        city: "Budapest",
        country: "HU",
        postal_code: "1000",
      },
    });
    await setConfig("STRIPE_TERMINAL_LOCATION_ID", created.id);
    return NextResponse.json({ locationId: created.id });
  } catch (err: any) {
    console.error("[terminal/location]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
