import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConfig } from "@/lib/config";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/billingo/test  — admin-only Billingo connectivity diagnostic.
 *
 * Verifies env config and probes the Billingo API so you can see *why*
 * invoices aren't being created (the fulfil path swallows errors silently).
 *
 * Returns:
 *   - env: which env vars are set (never leaks the key value)
 *   - documentBlocks: your blocks (confirms BILLINGO_BLOCK_ID is valid)
 *   - bankAccounts: your bank accounts (pick one for BILLINGO_BANK_ACCOUNT_ID)
 *   - blockIdValid / bankAccountIdValid: whether your configured ids exist
 */
const BASE = "https://api.billingo.hu/v3";

async function probe(path: string, key: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, body: json ?? text.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, status: 0, body: e?.message ?? String(e) };
  }
}

/** POST a real invoice using the SAME body shape as billingo.ts, returning the
 *  RAW Billingo response so we can see the exact validation error. */
async function tryCreateInvoice(key: string) {
  const vat = (await getConfig("BILLINGO_VAT")) || "27%";
  const paymentMethod = (await getConfig("BILLINGO_PAYMENT_METHOD")) || "online_bankcard";
  const blockId = Number(await getConfig("BILLINGO_BLOCK_ID"));
  const bankAccountRaw = await getConfig("BILLINGO_BANK_ACCOUNT_ID");
  const bankAccountId = bankAccountRaw ? Number(bankAccountRaw) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  // 1. partner
  const partnerRes = await fetch(`${BASE}/partners`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: "Billingo Test Partner",
      emails: ["test@example.com"],
      address: { country_code: "HU", post_code: "1011", city: "Budapest", address: "Teszt utca 1" },
    }),
  });
  const partnerText = await partnerRes.text();
  let partner: any = null;
  try { partner = JSON.parse(partnerText); } catch { /* */ }
  if (!partnerRes.ok) {
    return { step: "partner", status: partnerRes.status, body: partner ?? partnerText.slice(0, 500) };
  }

  // 2. document
  const body = {
    partner_id: partner.id,
    block_id: blockId,
    ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
    type: "invoice",
    fulfillment_date: today,
    due_date: today,
    payment_method: paymentMethod,
    language: "hu",
    currency: "HUF",
    conversion_rate: 1,
    electronic: true,
    paid: true,
    items: [{ name: "Billingo teszt tétel", unit_price: 1000, unit_price_type: "gross", quantity: 1, unit: "db", vat, currency: "HUF" }],
    settings: { should_send_letter: false, round: "five", without_financial_fulfillment: false },
  };
  const docRes = await fetch(`${BASE}/documents`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const docText = await docRes.text();
  let doc: any = null;
  try { doc = JSON.parse(docText); } catch { /* */ }
  return {
    step: "document",
    status: docRes.status,
    ok: docRes.ok,
    sentBody: body,
    body: doc ?? docText.slice(0, 800),
  };
}

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  const key = (await getConfig("BILLINGO_API_KEY")) || null;
  const blockId = (await getConfig("BILLINGO_BLOCK_ID")) || null;
  const bankAccountId = (await getConfig("BILLINGO_BANK_ACCOUNT_ID")) || null;
  const doCreate = new URL(req.url).searchParams.get("create") === "1";

  // Recent orders + their invoice rows — shows whether the buy flow ran and
  // whether it issued a real Billingo number or the INV-<ts> fallback.
  let recentOrders: any = undefined;
  try {
    const admin = await createAdminClient() as any;
    const { data: orders } = await admin
      .from("orders")
      .select("id, total, status, payment_method, created_at, stripe_payment_intent_id, invoices(number, pdf_url)")
      .order("created_at", { ascending: false })
      .limit(5);
    recentOrders = (orders ?? []).map((o: any) => ({
      id: o.id.slice(0, 8),
      total: o.total,
      status: o.status,
      payment_method: o.payment_method,
      created_at: o.created_at,
      hasPaymentIntent: !!o.stripe_payment_intent_id,
      invoice: o.invoices?.[0]
        ? {
            number: o.invoices[0].number,
            isBillingo: !String(o.invoices[0].number).startsWith("INV-"),
            pdf: o.invoices[0].pdf_url,
          }
        : "NO INVOICE ROW",
    }));
  } catch (e: any) {
    recentOrders = { error: e?.message ?? String(e) };
  }

  const env = {
    BILLINGO_API_KEY: key ? `set (${key.length} chars)` : "MISSING",
    BILLINGO_BLOCK_ID: blockId ?? "MISSING",
    BILLINGO_BANK_ACCOUNT_ID: bankAccountId ?? "not set (may be required)",
    BILLINGO_VAT: (await getConfig("BILLINGO_VAT")) || "27% (default)",
    BILLINGO_PAYMENT_METHOD: (await getConfig("BILLINGO_PAYMENT_METHOD")) || "online_bankcard (default)",
  };

  if (!key) {
    return NextResponse.json({ ok: false, env, hint: "Set BILLINGO_API_KEY in admin settings or Vercel." });
  }

  // Probe the API to confirm the key works + list blocks/accounts.
  const [blocks, accounts] = await Promise.all([
    probe("/document-blocks", key),
    probe("/bank-accounts", key),
  ]);

  const blockList: any[] = Array.isArray(blocks.body?.data) ? blocks.body.data : [];
  const acctList: any[] = Array.isArray(accounts.body?.data) ? accounts.body.data : [];

  const blockIdValid = blockId ? blockList.some((b) => String(b.id) === String(blockId)) : false;
  const bankAccountIdValid = bankAccountId ? acctList.some((a) => String(a.id) === String(bankAccountId)) : null;

  // ?create=1 → actually issue a real test invoice and return Billingo's raw reply.
  let createResult: any = undefined;
  if (doCreate) {
    try {
      createResult = await tryCreateInvoice(key);
    } catch (e: any) {
      createResult = { error: e?.message ?? String(e) };
    }
  }

  return NextResponse.json({
    ok: blocks.ok && accounts.ok,
    env,
    keyWorks: blocks.ok,
    recentOrders,
    createResult,
    documentBlocks: blocks.ok ? blockList.map((b) => ({ id: b.id, name: b.name })) : blocks,
    bankAccounts: accounts.ok ? acctList.map((a) => ({ id: a.id, name: a.name, account_number: a.account_number })) : accounts,
    blockIdValid,
    bankAccountIdValid,
    hints: [
      !blocks.ok && "API key rejected — check BILLINGO_API_KEY (use the v3 'API ID', not the Legacy API ID).",
      blocks.ok && !blockIdValid && `BILLINGO_BLOCK_ID=${blockId} not found. Use one of the ids in documentBlocks.`,
      acctList.length > 0 && !bankAccountId && "Billingo invoices usually require a bank account. Set BILLINGO_BANK_ACCOUNT_ID to one of the ids in bankAccounts.",
      bankAccountId && bankAccountIdValid === false && `BILLINGO_BANK_ACCOUNT_ID=${bankAccountId} not found. Use one of the ids in bankAccounts.`,
    ].filter(Boolean),
  });
}
