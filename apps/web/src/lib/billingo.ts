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
}

export interface BillingoInvoiceResult {
  documentId: number;
  number: string;
  pdfUrl: string | null;
}

function apiKey(): string | null {
  return process.env.BILLINGO_API_KEY || null;
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

export function billingoEnabled(): boolean {
  return !!apiKey() && !!process.env.BILLINGO_BLOCK_ID;
}

async function billingoFetch(path: string, init: RequestInit): Promise<any> {
  const key = apiKey();
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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Billingo ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
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
 * Issue an invoice for a paid order. Returns null when Billingo is not
 * configured or on any error (caller falls back to a local invoice number).
 */
export async function createBillingoInvoice(input: BillingoInvoiceInput): Promise<BillingoInvoiceResult | null> {
  if (!billingoEnabled()) return null;

  const vat = process.env.BILLINGO_VAT || "27%";
  const paymentMethod = process.env.BILLINGO_PAYMENT_METHOD || "online_bankcard";
  const blockId = Number(process.env.BILLINGO_BLOCK_ID);
  const bankAccountId = process.env.BILLINGO_BANK_ACCOUNT_ID
    ? Number(process.env.BILLINGO_BANK_ACCOUNT_ID)
    : undefined;
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
      items: input.items.map((it) => ({
        name: it.name,
        unit_price: it.unitPrice,
        unit_price_type: "gross",
        quantity: it.quantity,
        unit: "db",
        vat,
        currency: input.currency,
      })),
      // round "five" only valid for HUF; other currencies must use "two".
      settings: {
        should_send_letter: false,
        round: input.currency === "HUF" ? "five" : "two",
        without_financial_fulfillment: false,
      },
    };

    const doc = await billingoFetch("/documents", { method: "POST", body: JSON.stringify(body) });
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
