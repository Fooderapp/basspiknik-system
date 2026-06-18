import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR", "STAFF"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { qrCode } = await req.json();
  if (!qrCode) return NextResponse.json({ error: "QR code required" }, { status: 400 });

  const supabase = createAdminClient() as any;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let ticket: any = null;

  if (UUID_RE.test(qrCode)) {
    // Could be a wallet pass QR (wallet_token) — resolve user then find valid ticket
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("wallet_token", qrCode)
      .single();

    if (prof?.id) {
      // Find this user's next valid ticket (nearest upcoming event)
      const { data: walletTickets } = await supabase
        .from("tickets")
        .select("*, events(name, start_date), ticket_types(name, tier, entries_per_ticket), check_ins(*), orders!inner(user_id)")
        .eq("orders.user_id", prof.id)
        .eq("status", "VALID")
        .order("created_at", { ascending: true })
        .limit(1);
      ticket = walletTickets?.[0] ?? null;
    }

    if (!ticket) {
      // Fall back: UUID might be a ticket qr_code directly
      const { data: t } = await supabase
        .from("tickets")
        .select("*, events(name, start_date), ticket_types(name, tier, entries_per_ticket), check_ins(*)")
        .eq("qr_code", qrCode)
        .single();
      ticket = t ?? null;
    }
  } else {
    // Non-UUID: individual ticket QR code
    const { data: t } = await supabase
      .from("tickets")
      .select("*, events(name, start_date), ticket_types(name, tier, entries_per_ticket), check_ins(*)")
      .eq("qr_code", qrCode)
      .single();
    ticket = t ?? null;
  }

  if (!ticket) {
    return NextResponse.json({
      success: false,
      status: "INVALID",
      message: "Ticket not found",
    }, { status: 404 });
  }

  // Door tickets are marked USED at POS sale — treat them as already checked in
  if (ticket.status === "USED") {
    const lastCi = Array.isArray(ticket.check_ins) && ticket.check_ins.length > 0
      ? ticket.check_ins[ticket.check_ins.length - 1]
      : null;
    return NextResponse.json({
      success: false,
      status: "ALREADY_USED",
      message: "Already checked in",
      ticket: {
        id: ticket.id,
        holderName: ticket.holder_name,
        ticketName: ticket.ticket_name,
        tier: ticket.ticket_types?.tier,
        event: ticket.events?.name,
        checkedInAt: lastCi?.checked_in_at ?? null,
        entriesUsed: Array.isArray(ticket.check_ins) ? ticket.check_ins.length : 1,
        entriesAllowed: ticket.ticket_types?.entries_per_ticket ?? 1,
      },
    });
  }

  if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
    return NextResponse.json({
      success: false,
      status: "CANCELLED",
      message: "Ticket has been cancelled",
      ticket: {
        id: ticket.id,
        holderName: ticket.holder_name,
        ticketName: ticket.ticket_name,
        tier: ticket.ticket_types?.tier,
        event: ticket.events?.name,
      },
    });
  }

  const entriesAllowed: number = ticket.ticket_types?.entries_per_ticket ?? 1;
  const entriesUsed: number = Array.isArray(ticket.check_ins) ? ticket.check_ins.length : 0;
  const isMultiEntry = entriesAllowed > 1;

  // All entries exhausted
  if (entriesUsed >= entriesAllowed) {
    const lastCi = Array.isArray(ticket.check_ins) && ticket.check_ins.length > 0
      ? ticket.check_ins[ticket.check_ins.length - 1]
      : null;
    return NextResponse.json({
      success: false,
      status: "ALREADY_USED",
      message: isMultiEntry
        ? `All ${entriesAllowed} entries used`
        : "Already checked in",
      ticket: {
        id: ticket.id,
        holderName: ticket.holder_name,
        ticketName: ticket.ticket_name,
        tier: ticket.ticket_types?.tier,
        event: ticket.events?.name,
        checkedInAt: lastCi?.checked_in_at ?? null,
        entriesUsed,
        entriesAllowed,
      },
    });
  }

  // Perform check-in
  const { error: ciErr } = await supabase.from("check_ins").insert({
    ticket_id: ticket.id,
    event_id: ticket.event_id,
    checked_in_by: profile.id,
  });

  if (ciErr) {
    return NextResponse.json({ error: ciErr.message }, { status: 500 });
  }

  const entriesNowUsed = entriesUsed + 1;
  const entriesLeft = entriesAllowed - entriesNowUsed;

  // Only mark USED when all entries are consumed
  if (entriesNowUsed >= entriesAllowed) {
    await supabase.from("tickets").update({ status: "USED" }).eq("id", ticket.id);
  }

  return NextResponse.json({
    success: true,
    status: "OK",
    message: isMultiEntry
      ? `Entry ${entriesNowUsed} of ${entriesAllowed} — ${entriesLeft} left`
      : "Welcome!",
    ticket: {
      id: ticket.id,
      holderName: ticket.holder_name,
      ticketName: ticket.ticket_name,
      tier: ticket.ticket_types?.tier,
      event: ticket.events?.name,
      entriesUsed: entriesNowUsed,
      entriesAllowed,
      entriesLeft,
    },
  });
}
