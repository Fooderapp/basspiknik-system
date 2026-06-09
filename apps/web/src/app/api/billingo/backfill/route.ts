import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/billingo/backfill            → backfill the latest paid order missing an invoice
 * POST /api/billingo/backfill?orderId=ID → backfill a specific order
 *
 * Admin-only. Re-runs invoice creation against the REAL order data and returns
 * the raw result/error at every step. Both diagnoses why invoices fail in the
 * fulfil path AND issues the missing invoice when it succeeds.
 */
const BASE = "https://api.billingo.hu/v3";

async function bfetch(path: string, key: string, init: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, status: res.status, body: json ?? text.slice(0, 800) };
}

// Allow GET so it can be triggered straight from the browser address bar.
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  const key = process.env.BILLINGO_API_KEY;
  if (!key) return NextResponse.json({ error: "BILLINGO_API_KEY not set" }, { status: 400 });

  const admin = await createAdminClient() as any;
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");

  // 1. Resolve order (specific, or latest paid w/ total>0 lacking an invoice)
  let order: any = null;
  if (orderId) {
    const { data } = await admin
      .from("orders")
      .select("*, events(name, tax_rate), order_items(quantity, unit_price, total, ticket_types(name)), invoices(number)")
      .eq("id", orderId)
      .single();
    order = data;
  } else {
    const { data } = await admin
      .from("orders")
      .select("*, events(name, tax_rate), order_items(quantity, unit_price, total, ticket_types(name)), invoices(number)")
      .eq("status", "PAID")
      .gt("total", 0)
      .order("created_at", { ascending: false })
      .limit(20);
    order = (data ?? []).find((o: any) => !o.invoices || o.invoices.length === 0) ?? null;
  }

  if (!order) return NextResponse.json({ error: "No paid order without an invoice found" }, { status: 404 });
  if (order.invoices?.length) {
    return NextResponse.json({ skipped: "already has invoice", number: order.invoices[0].number });
  }

  // 2. Buyer billing (from profile if registered)
  let billing: any = null;
  if (order.user_id) {
    const { data: prof } = await admin
      .from("profiles")
      .select("billing_name, billing_address, billing_city, billing_postal_code, billing_country, name, email")
      .eq("id", order.user_id)
      .single();
    billing = prof;
  }

  const vat = process.env.BILLINGO_VAT || "27%";
  const paymentMethod = process.env.BILLINGO_PAYMENT_METHOD || "online_bankcard";
  const blockId = Number(process.env.BILLINGO_BLOCK_ID);
  const bankAccountId = process.env.BILLINGO_BANK_ACCOUNT_ID ? Number(process.env.BILLINGO_BANK_ACCOUNT_ID) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const currency = order.currency || "HUF";

  // 3. Partner
  const partnerBody = {
    name: billing?.billing_name || billing?.name || order.guest_name || "Vásárló",
    emails: (billing?.email || order.guest_email) ? [billing?.email || order.guest_email] : [],
    address: {
      country_code: billing?.billing_country || "HU",
      post_code: billing?.billing_postal_code || "",
      city: billing?.billing_city || "",
      address: billing?.billing_address || "",
    },
  };
  const partner = await bfetch("/partners", key, { method: "POST", body: JSON.stringify(partnerBody) });
  if (!partner.ok) {
    return NextResponse.json({ step: "partner", orderId: order.id, partnerBody, result: partner }, { status: 200 });
  }

  // 4. Document
  const items = (order.order_items ?? [])
    .map((it: any) => ({
      name: `${order.events?.name ?? "Event"} — ${it.ticket_types?.name ?? "Ticket"}`,
      unit_price: it.unit_price,
      unit_price_type: "gross",
      quantity: it.quantity,
      unit: "db",
      vat,
      currency,
    }))
    .filter((it: any) => it.unit_price > 0);

  if (items.length === 0) {
    return NextResponse.json({ step: "items", orderId: order.id, error: "No paid line items (all unit_price 0)", order_items: order.order_items });
  }

  const docBody = {
    partner_id: partner.body.id,
    block_id: blockId,
    ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
    type: "invoice",
    fulfillment_date: today,
    due_date: today,
    payment_method: paymentMethod,
    language: "hu",
    currency,
    conversion_rate: 1,
    electronic: true,
    paid: true,
    items,
    settings: { should_send_letter: false, round: currency === "HUF" ? "five" : "two", without_financial_fulfillment: false },
  };
  const doc = await bfetch("/documents", key, { method: "POST", body: JSON.stringify(docBody) });
  if (!doc.ok) {
    return NextResponse.json({ step: "document", orderId: order.id, docBody, result: doc }, { status: 200 });
  }

  // 5. Persist invoice row — surface any DB error explicitly
  const number = doc.body.invoice_number || `BILLINGO-${doc.body.id}`;
  const { error: insErr } = await admin.from("invoices").insert({
    order_id: order.id,
    number,
    pdf_url: doc.body.public_url ?? null,
  });

  return NextResponse.json({
    ok: !insErr,
    orderId: order.id,
    invoiceNumber: number,
    pdf: doc.body.public_url ?? null,
    dbInsertError: insErr ? { message: insErr.message, details: insErr.details, hint: insErr.hint, code: insErr.code } : null,
  });
}
