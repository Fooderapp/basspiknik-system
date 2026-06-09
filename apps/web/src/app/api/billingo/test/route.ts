import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";

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

export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  const key = process.env.BILLINGO_API_KEY || null;
  const blockId = process.env.BILLINGO_BLOCK_ID || null;
  const bankAccountId = process.env.BILLINGO_BANK_ACCOUNT_ID || null;

  const env = {
    BILLINGO_API_KEY: key ? `set (${key.length} chars)` : "MISSING",
    BILLINGO_BLOCK_ID: blockId ?? "MISSING",
    BILLINGO_BANK_ACCOUNT_ID: bankAccountId ?? "not set (may be required)",
    BILLINGO_VAT: process.env.BILLINGO_VAT || "27% (default)",
    BILLINGO_PAYMENT_METHOD: process.env.BILLINGO_PAYMENT_METHOD || "online_bankcard (default)",
  };

  if (!key) {
    return NextResponse.json({ ok: false, env, hint: "Set BILLINGO_API_KEY in Vercel and redeploy." });
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

  return NextResponse.json({
    ok: blocks.ok && accounts.ok,
    env,
    keyWorks: blocks.ok,
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
