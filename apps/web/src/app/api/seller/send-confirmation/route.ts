import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTicketConfirmation } from "@/lib/email";
import { getSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify Bearer token (mobile pattern — no cookies)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single() as any;

  if (!caller || !["ADMIN", "EDITOR", "SELLER"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*, events(name, start_date, venue, banner_image_url)")
    .eq("id", orderId)
    .single() as any;

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Resolve buyer email: guest_email or linked profile
  let buyerEmail = order.guest_email ?? null;
  if (!buyerEmail && order.user_id) {
    const { data: buyerProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", order.user_id)
      .single() as any;
    buyerEmail = buyerProfile?.email ?? null;
  }

  if (!buyerEmail) {
    return NextResponse.json({ skipped: true, reason: "no_email" });
  }

  const { data: tickets } = await supabaseAdmin
    .from("tickets")
    .select("*")
    .eq("order_id", orderId) as any;

  if (!tickets?.length) return NextResponse.json({ error: "No tickets found" }, { status: 404 });

  const appSettings = await getSettings();

  await sendTicketConfirmation({
    to: buyerEmail,
    buyerName: order.guest_name || "Guest",
    eventName: order.events.name,
    eventDate: order.events.start_date,
    eventVenue: order.events.venue ?? undefined,
    eventBannerUrl: order.events.banner_image_url ?? null,
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
