import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/tickets/[id]/google-wallet
 *
 * Redirects to a Google Wallet "Add to Google Wallet" URL.
 *
 * Requires:
 *   GOOGLE_WALLET_ISSUER_ID        — Google Pay & Wallet issuer ID
 *   GOOGLE_WALLET_SERVICE_ACCOUNT  — Service account JSON (base64 encoded)
 *
 * Without those env vars the endpoint returns 501.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (
    !process.env.GOOGLE_WALLET_ISSUER_ID ||
    !process.env.GOOGLE_WALLET_SERVICE_ACCOUNT
  ) {
    return NextResponse.json(
      { error: "Google Wallet not configured. Set GOOGLE_WALLET_* env vars." },
      { status: 501 },
    );
  }

  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, qr_code, ticket_name, tier, status, events(name, venue, start_date)")
    .eq("id", id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // TODO: sign a JWT with Google Wallet API and redirect to:
  // https://pay.google.com/gp/v/save/<JWT>
  return NextResponse.json({ error: "Google Wallet not yet implemented" }, { status: 501 });
}
