import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { getSettings, toStripeAmount } from "@/lib/settings";

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowed = ["ADMIN", "EDITOR", "SELLER"];
    if (!profile || !allowed.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // amount arrives as display-unit value (e.g. 5000 for 5000 HUF).
    const { amount, metadata = {} } = await req.json();
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount required" }, { status: 400 });
    }

    // Always use the app's configured currency — card_present (Tap to Pay)
    // MUST use the Stripe account's settlement currency.
    const settings = await getSettings();
    const currency = settings.currency.toLowerCase(); // "huf", "eur", etc.

    const stripe = await getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: toStripeAmount(amount, settings.currency),
      currency,
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      metadata: {
        ...metadata,
        seller_id: user.id,
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    console.error("[terminal/payment-intent]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
