import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

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

    // TODO: default currency must match the Stripe account's country currency.
    // GBP = UK Ltd account (current). Change to "eur" (Eurozone account)
    // or "huf" (Hungarian account) once Stripe entity is confirmed.
    // card_present (Tap to Pay) does NOT accept a currency that differs from
    // the account's settlement currency unless multi-currency is enabled.
    const { amount, currency = "gbp", metadata = {} } = await req.json();

    if (!amount || amount < 50) {
      return NextResponse.json({ error: "Amount must be at least 50 cents" }, { status: 400 });
    }

    // card_present (Tap to Pay) settles in the Stripe account's country currency.
    // A GB account only accepts GBP, a Eurozone account only EUR, etc.
    // Validate up front so a mismatch returns a clear message instead of
    // Stripe's cryptic "card_present ... not supported in GB".
    const account = await stripe.accounts.retrieve();
    const accountCurrency = account.default_currency?.toLowerCase();
    if (accountCurrency && accountCurrency !== currency.toLowerCase()) {
      return NextResponse.json(
        {
          error: `Tap to Pay currency mismatch: this Stripe account (country ${account.country}) settles in ${accountCurrency.toUpperCase()}, but the charge requested ${currency.toUpperCase()}. In-person card_present payments must use the account country's currency. Use a Eurozone Stripe account for EUR.`,
        },
        { status: 400 },
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
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
