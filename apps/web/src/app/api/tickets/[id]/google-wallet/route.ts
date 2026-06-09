import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/tickets/[id]/google-wallet?token=<supabase_access_token>
 *
 * Redirects to a Google Wallet "Add to Google Wallet" URL.
 * `token` query param allows mobile apps to authenticate without web cookies.
 *
 * Requires:
 *   GOOGLE_WALLET_ISSUER_ID        — Google Pay & Wallet issuer ID
 *   GOOGLE_WALLET_SERVICE_ACCOUNT  — Service account JSON (base64 encoded)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Auth: cookie session OR ?token= from mobile ──
  let userId: string | null = null;

  const bearerToken = req.nextUrl.searchParams.get("token");
  if (bearerToken) {
    const admin = createAdminClient() as any;
    const { data: { user } } = await admin.auth.getUser(bearerToken);
    userId = user?.id ?? null;
  } else {
    const supabase = await createClient() as any;
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.GOOGLE_WALLET_ISSUER_ID ||
    !process.env.GOOGLE_WALLET_SERVICE_ACCOUNT
  ) {
    return NextResponse.json(
      { error: "Google Wallet not configured. Set GOOGLE_WALLET_* env vars." },
      { status: 501 },
    );
  }

  const adminDb = createAdminClient() as any;
  const { data: ticket } = await adminDb
    .from("tickets")
    .select("id, qr_code, ticket_name, tier, status, events(name, venue, start_date)")
    .eq("id", id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // TODO: sign a JWT with Google Wallet API and redirect to:
  // https://pay.google.com/gp/v/save/<JWT>
  return NextResponse.json({ error: "Google Wallet not yet implemented. Add GOOGLE_WALLET_* env vars." }, { status: 501 });
}
