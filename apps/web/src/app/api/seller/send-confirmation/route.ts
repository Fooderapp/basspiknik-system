import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendTicketConfirmation } from "@/lib/email";
import { getSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single() as any;

  if (!caller || !["ADMIN", "EDITOR", "SELLER"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const admin = await createAdminClient() as any;

  const { data: order } = await admin
    .from("orders")
    .select("*, events(name, start_date, venue)")
    .eq("id", orderId)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const buyerEmail = order.guest_email
    ?? (order.user_id
      ? (await admin.from("profiles").select("email").eq("id", order.user_id).single()).data?.email
      : null);

  if (!buyerEmail) {
    return NextResponse.json({ skipped: true, reason: "no_email" });
  }

  const { data: tickets } = await admin
    .from("tickets")
    .select("*")
    .eq("order_id", orderId);

  if (!tickets?.length) return NextResponse.json({ error: "No tickets found" }, { status: 404 });

  const appSettings = await getSettings();

  await sendTicketConfirmation({
    to: buyerEmail,
    buyerName: order.guest_name || "Guest",
    eventName: order.events.name,
    eventDate: order.events.start_date,
    eventVenue: order.events.venue ?? undefined,
    tickets: tickets.map((t: any) => ({
      id: t.id,
      qrCode: t.qr_code,
      ticketName: t.ticket_name ?? "Ticket",
      tier: t.tier ?? "GENERAL",
      holderName: t.holder_name || undefined,
    })),
    total: order.total,
    orderId: order.id,
    language: appSettings.language,
    currency: appSettings.currency,
  });

  return NextResponse.json({ sent: true, to: buyerEmail });
}
