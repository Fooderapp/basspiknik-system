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

  const supabase = await createAdminClient() as any;

  // Look up ticket by QR code — include ticket_type for entries_per_ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("*, events(name, start_date), ticket_types(name, tier, entries_per_ticket), check_ins(*)")
    .eq("qr_code", qrCode)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({
      success: false,
      status: "INVALID",
      message: "Ticket not found",
    }, { status: 404 });
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
