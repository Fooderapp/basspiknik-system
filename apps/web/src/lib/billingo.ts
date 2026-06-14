/**
 * Billingo v3 invoicing client.
 * https://api.billingo.hu/v3 — auth via `X-API-KEY` header.
 *
 * Replaces the placeholder local invoice numbers with real Hungarian e-invoices.
 * Entirely gated on env: if BILLINGO_API_KEY is unset the helper is a no-op
 * (returns null) so order fulfilment never breaks before the integration is
 * configured.
 *
 * Required env (Vercel):
 *   BILLINGO_API_KEY          — API key from Billingo → Settings → API keys
 *   BILLINGO_BLOCK_ID         — document block id (numeric) to issue invoices into
 * Optional env:
 *   BILLINGO_VAT              — VAT rate string, e.g. "27%", "5%", "AAM" (default "27%")
 *   BILLINGO_PAYMENT_METHOD   — Billingo payment method enum (default "online_bankcard")
 *   BILLINGO_BANK_ACCOUNT_ID  — bank account id (numeric) to show on the invoice
 */

import { getConfig } from "@/lib/config";

const BASE = "https://api.billingo.hu/v3";

export interface BillingoBuyer {
  name: string;
  email?: string | null;
  /** Billing address (best-effort; Billingo accepts partial). */
  countryCode?: string | null; // ISO-2, e.g. "HU"
  postCode?: string | null;
  city?: string | null;
  address?: string | null;
  /** VAT/tax number for company invoices. */
  taxNumber?: string | null;
}

export interface BillingoLineItem {
  name: string;
  unitPrice: number; // gross/net per `vat` setting — we treat as gross-inclusive
  quantity: number;
}

export interface BillingoInvoiceInput {
  buyer: BillingoBuyer;
  items: BillingoLineItem[];
  currency: string; // "HUF" | "EUR"
  language?: "hu" | "en";
  /** Whether the order is already paid (true for online card). */
  paid?: boolean;
  /** Override the default payment method (e.g. "cash" / "bankcard" for POS). */
  paymentMethod?: string;
}

export interface BillingoInvoiceResult {
  documentId: number;
  number: string;
  pdfUrl: string | null;
}

async function apiKey(): Promise<string | null> {
  return (await getConfig("BILLINGO_API_KEY")) || null;
}

/** Billingo requires an ISO-3166-1 alpha-2 country code. Profiles often store
 *  the full country name ("Magyarország", "Hungary"). Map the common ones and
 *  fall back to "HU" for anything that isn't already a 2-letter code. */
const COUNTRY_MAP: Record<string, string> = {
  magyarorszag: "HU", hungary: "HU", magyar: "HU",
  austria: "AT", osztrak: "AT", ausztria: "AT",
  germany: "DE", deutschland: "DE", nemetorszag: "DE",
  slovakia: "SK", szlovakia: "SK",
  romania: "RO", romania_hu: "RO",
};
export function normalizeCountryCode(raw?: string | null): string {
  if (!raw) return "HU";
  const trimmed = raw.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining accents → "magyarország" → "magyarorszag"
  return COUNTRY_MAP[key] || "HU";
}

export async function billingoEnabled(): Promise<boolean> {
  return !!(await apiKey()) && !!(await getConfig("BILLINGO_BLOCK_ID"));
}

async function billingoFetch(path: string, init: RequestInit): Promise<any> {
  const key = await apiKey();
  if (!key) throw new Error("BILLINGO_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  // Read body once as text so we can use it in both error reporting and JSON parsing.
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Billingo ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  // /send and similar action endpoints return 200/204 with an empty body — don't
  // try to JSON.parse("") as that throws "Unexpected end of JSON input".
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    // Non-JSON response (e.g. plain-text "OK") — return as-is so callers don't crash.
    return { _raw: body };
  }
}

/** Create (always-new) partner for the buyer, return its id. */
async function createPartner(buyer: BillingoBuyer): Promise<number> {
  const body: Record<string, unknown> = {
    name: buyer.name || "Vásárló",
    emails: buyer.email ? [buyer.email] : [],
    address: {
      country_code: normalizeCountryCode(buyer.countryCode),
      post_code: buyer.postCode || "",
      city: buyer.city || "",
      address: buyer.address || "",
    },
  };
  if (buyer.taxNumber) body.taxcode = buyer.taxNumber;
  const partner = await billingoFetch("/partners", { method: "POST", body: JSON.stringify(body) });
  return partner.id as number;
}

/**
 * Issue a RECEIPT (Hungarian "nyugta") for a paid order — the default document
 * for consumer ticket sales. A receipt is anonymous (no buyer name/address
 * required by law), so this needs no partner. Uses the dedicated
 * POST /documents/receipt endpoint and its own document block.
 *
 * Returns null when not configured (no receipt block) or on any error, so
 * fulfilment never breaks. Falls back to an invoice block if no receipt block
 * is set but invoicing is — keeps existing single-block setups working.
 */
export async function createBillingoReceipt(
  input: Pick<BillingoInvoiceInput, "items" | "currency" | "language" | "paid" | "paymentMethod"> & { email?: string | null },
): Promise<BillingoInvoiceResult | null> {
  const key = await apiKey();
  if (!key) return null;
  const receiptBlock = (await getConfig("BILLINGO_RECEIPT_BLOCK_ID")) || (await getConfig("BILLINGO_BLOCK_ID"));
  if (!receiptBlock) return null;

  const vat = (await getConfig("BILLINGO_VAT")) || "27%";
  const paymentMethod = input.paymentMethod || (await getConfig("BILLINGO_PAYMENT_METHOD")) || "online_bankcard";

  try {
    const body: Record<string, unknown> = {
      block_id: Number(receiptBlock),
      payment_method: paymentMethod,
      language: (input.language || "hu").toUpperCase() === "EN" ? "en" : "hu",
      currency: input.currency,
      conversion_rate: 1,
      electronic: true,
      paid: input.paid ?? true,
      items: input.items.map((it) => ({
        name: it.name,
        unit_price: it.unitPrice,
        unit_price_type: "gross",
        quantity: it.quantity,
        unit: "db",
        vat,
        currency: input.currency,
      })),
      settings: {
        round: input.currency === "HUF" ? "five" : "none",
        without_financial_fulfillment: false,
      },
    };

    const doc = await billingoFetch("/documents/receipt", { method: "POST", body: JSON.stringify(body) });

    // Email the receipt when we have an address (optional — receipts are often
    // just printed/shown). Non-fatal on failure.
    if (input.email && doc.id) {
      try {
        await billingoFetch(`/documents/${doc.id}/send`, {
          method: "POST",
          body: JSON.stringify({ emails: [input.email] }),
        });
      } catch (sendErr) {
        console.error(`Billingo receipt send FAILED — ${doc.id}:`, sendErr instanceof Error ? sendErr.message : String(sendErr));
      }
    }

    return {
      documentId: doc.id as number,
      number: (doc.invoice_number as string) || (doc.receipt_number as string) || `BILLINGO-${doc.id}`,
      pdfUrl: (doc.public_url as string) || null,
    };
  } catch (e) {
    console.error("Billingo receipt failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Issue an invoice for a paid order. Returns null when Billingo is not
 * configured or on any error (caller falls back to a local invoice number).
 */
export async function createBillingoInvoice(input: BillingoInvoiceInput): Promise<BillingoInvoiceResult | null> {
  if (!(await billingoEnabled())) return null;

  const vat = (await getConfig("BILLINGO_VAT")) || "27%";
  const paymentMethod = input.paymentMethod || (await getConfig("BILLINGO_PAYMENT_METHOD")) || "online_bankcard";
  const blockId = Number(await getConfig("BILLINGO_BLOCK_ID"));
  const bankAccountRaw = await getConfig("BILLINGO_BANK_ACCOUNT_ID");
  const bankAccountId = bankAccountRaw ? Number(bankAccountRaw) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const partnerId = await createPartner(input.buyer);

    const body: Record<string, unknown> = {
      partner_id: partnerId,
      block_id: blockId,
      ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
      type: "invoice",
      fulfillment_date: today,
      due_date: today,
      payment_method: paymentMethod,
      language: (input.language || "hu").toUpperCase() === "EN" ? "en" : "hu",
      currency: input.currency,
      conversion_rate: 1,
      electronic: true,
      paid: input.paid ?? true,
      // Top-level flag (v3 API requires it here AND in settings for some plans)
      should_send_letter: !!(input.buyer.email),
      items: input.items.map((it) => ({
        name: it.name,
        unit_price: it.unitPrice,
        unit_price_type: "gross",
        quantity: it.quantity,
        unit: "db",
        vat,
        currency: input.currency,
      })),
      // Billingo round enum: none/half/one/five/ten/fifty/hundred/thousand.
      // HUF cash rounds to 5; decimal currencies (EUR) must NOT round → "none".
      settings: {
        should_send_letter: !!(input.buyer.email),
        round: input.currency === "HUF" ? "five" : "none",
        without_financial_fulfillment: false,
      },
    };

    const doc = await billingoFetch("/documents", { method: "POST", body: JSON.stringify(body) });

    // Explicitly send the invoice by email.
    // should_send_letter in the create payload is unreliable on some Billingo plans;
    // the /send endpoint is the guaranteed delivery mechanism.
    // Note: billingoFetch now handles empty-body responses (200/204) without throwing.
    if (input.buyer.email && doc.id) {
      try {
        await billingoFetch(`/documents/${doc.id}/send`, {
          method: "POST",
          body: JSON.stringify({ emails: [input.buyer.email] }),
        });
        console.log(`Billingo send OK — document ${doc.id} → ${input.buyer.email}`);
      } catch (sendErr) {
        // Non-fatal: invoice exists, but email delivery failed.
        // Full error is logged so it shows in Vercel function logs.
        console.error(
          `Billingo send FAILED — document ${doc.id} → ${input.buyer.email}:`,
          sendErr instanceof Error ? sendErr.message : String(sendErr),
        );
      }
    }

    return {
      documentId: doc.id as number,
      number: (doc.invoice_number as string) || `BILLINGO-${doc.id}`,
      pdfUrl: (doc.public_url as string) || null,
    };
  } catch (e) {
    console.error("Billingo invoice failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
