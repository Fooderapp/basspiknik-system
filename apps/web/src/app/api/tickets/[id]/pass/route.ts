import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/tickets/[id]/pass?token=<supabase_access_token>
 *
 * Returns an Apple Wallet .pkpass file for the given ticket.
 * `token` query param allows mobile apps to authenticate without web cookies.
 *
 * Requires (env vars to enable pass generation):
 *   APPLE_PASS_TEAM_ID        — Apple Developer Team ID
 *   APPLE_PASS_TYPE_ID        — Pass Type Identifier (e.g. pass.com.yourapp.ticket)
 *   APPLE_PASS_CERT_PEM       — Signer certificate (PEM)
 *   APPLE_PASS_KEY_PEM        — Private key (PEM)
 *   APPLE_PASS_WWDR_PEM       — Apple WWDR intermediate certificate (PEM)
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
    !process.env.APPLE_PASS_TEAM_ID ||
    !process.env.APPLE_PASS_TYPE_ID ||
    !process.env.APPLE_PASS_CERT_PEM
  ) {
    return NextResponse.json(
      { error: "Apple Wallet not configured. Set APPLE_PASS_* env vars." },
      { status: 501 },
    );
  }

  // Verify ticket belongs to this user
  const adminDb = createAdminClient() as any;
  const { data: ticket } = await adminDb
    .from("tickets")
    .select("id, qr_code, ticket_name, tier, status, events(name, venue, start_date)")
    .eq("id", id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // TODO: generate .pkpass using passkit-generator
  // https://github.com/alexandercerutti/passkit-generator
  return NextResponse.json({ error: "Pass generation not yet implemented. Add APPLE_PASS_* env vars and install passkit-generator." }, { status: 501 });
}
