import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PKPass } from "passkit-generator";
import path from "path";
import fs from "fs";

// Apple Wallet pass generation
// Certs loaded from base64 env vars (Vercel) or files (local dev)
// Env vars needed: WALLET_PASS_TYPE_ID, APPLE_TEAM_ID, WALLET_PASS_PHRASE
//   + WALLET_CERT_BASE64, WALLET_KEY_BASE64, WALLET_WWDR_BASE64 (Vercel)

const CERTS_DIR       = path.join(process.cwd(), "certs");
const PASS_TYPE_ID    = process.env.WALLET_PASS_TYPE_ID ?? "pass.com.eventos.mobile.ticket";
const TEAM_ID         = process.env.APPLE_TEAM_ID ?? "";
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "";
const PASS_PHRASE     = process.env.WALLET_PASS_PHRASE;

function loadCert(envKey: string, fileName: string): Buffer {
  if (process.env[envKey]) {
    return Buffer.from(process.env[envKey]!, "base64");
  }
  const filePath = path.join(CERTS_DIR, fileName);
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  throw new Error(`Certificate not found: set ${envKey} env var or place file at certs/${fileName}`);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.slice(7),
    );
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch ticket ─────────────────────────────────────────────────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("*, orders!inner(user_id), events(name, start_date, venue)")
      .eq("id", params.id)
      .eq("orders.user_id", user.id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (ticket.status !== "VALID") {
      return NextResponse.json({ error: "Ticket is not valid" }, { status: 400 });
    }

    // ── Load certs ───────────────────────────────────────────────────────────
    let signerCert: Buffer, signerKey: Buffer, wwdr: Buffer;
    try {
      signerCert = loadCert("WALLET_CERT_BASE64", "signerCert.pem");
      signerKey  = loadCert("WALLET_KEY_BASE64",  "signerKey.pem");
      wwdr       = loadCert("WALLET_WWDR_BASE64",  "wwdr.pem");
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }

    const event      = (ticket as any).events;
    const eventName  = event?.name ?? "EventOS Ticket";
    const eventDate  = event?.start_date
      ? new Date(event.start_date).toLocaleDateString("en-US", { dateStyle: "medium" })
      : "";
    const venue      = event?.venue ?? "";

    // ── Build pass ───────────────────────────────────────────────────────────
    const pass = new PKPass(
      {},
      {
        wwdr,
        signerCert,
        signerKey,
        signerKeyPassphrase:  PASS_PHRASE,
      },
      {
        serialNumber:        ticket.id,
        description:         `${eventName} Ticket`,
        organizationName:    "EventOS",
        passTypeIdentifier:  PASS_TYPE_ID,
        teamIdentifier:      TEAM_ID,
        foregroundColor:     "rgb(250, 250, 250)",
        backgroundColor:     "rgb(9, 9, 11)",
        labelColor:          "rgb(161, 161, 170)",
      },
    );

    // Set pass type to eventTicket
    pass.type = "eventTicket";

    // Primary field: event name
    pass.primaryFields.push({
      key:   "event",
      label: "EVENT",
      value: eventName,
    });

    // Secondary fields
    if (eventDate) {
      pass.secondaryFields.push({ key: "date", label: "DATE", value: eventDate });
    }
    pass.secondaryFields.push({ key: "tier", label: "TIER", value: ticket.tier });

    // Auxiliary fields
    if (ticket.holder_name) {
      pass.auxiliaryFields.push({ key: "name", label: "NAME", value: ticket.holder_name });
    }
    if (venue) {
      pass.auxiliaryFields.push({ key: "venue", label: "VENUE", value: venue });
    }

    // Back fields
    pass.backFields.push(
      { key: "ticket_id", label: "Ticket ID", value: ticket.id },
      { key: "support",   label: "Support",   value: APP_URL },
    );

    // QR barcode
    pass.setBarcodes({
      message:         ticket.qr_code,
      format:          "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    });

    const buf = pass.getAsBuffer();

    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type":        "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="ticket-${ticket.id}.pkpass"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err: any) {
    console.error("[wallet]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
