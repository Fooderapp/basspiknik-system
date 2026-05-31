import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PKPass } from "passkit-generator";
import path from "path";
import fs from "fs";

// Per-user Apple Wallet pass.
// One pass per user — its QR encodes the user's stable `wallet_token`.
// At the door the check-in station picks the event, scans this pass, and
// checks in the user's next valid ticket for that event (checkin_user_ticket).
//
// Certs loaded from base64 env vars (Vercel) or files (local dev).
// Env: WALLET_PASS_TYPE_ID, APPLE_TEAM_ID, WALLET_PASS_PHRASE,
//      WALLET_CERT_BASE64, WALLET_KEY_BASE64, WALLET_WWDR_BASE64

const CERTS_DIR    = path.join(process.cwd(), "certs");
const PASS_TYPE_ID = process.env.WALLET_PASS_TYPE_ID ?? "pass.com.eventos.mobile.ticket";
const TEAM_ID      = process.env.APPLE_TEAM_ID ?? "";
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? "";
const PASS_PHRASE  = process.env.WALLET_PASS_PHRASE;

function loadCert(envKey: string, fileName: string): Buffer {
  if (process.env[envKey]) {
    return Buffer.from(process.env[envKey]!, "base64");
  }
  const filePath = path.join(CERTS_DIR, fileName);
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  throw new Error(`Certificate not found: set ${envKey} env var or place file at certs/${fileName}`);
}

export async function GET(req: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    // Token may arrive via Authorization header (fetch) OR ?token= query param,
    // because the mobile app opens this URL in Safari (no headers) so iOS can
    // prompt "Add to Apple Wallet" for the .pkpass response.
    const authHeader = req.headers.get("authorization");
    const queryToken = new URL(req.url).searchParams.get("token");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : queryToken;
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      accessToken,
    );
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Resolve the user's wallet token (create if missing) ────────────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, wallet_token")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let walletToken: string | null = (profile as any).wallet_token;
    if (!walletToken) {
      walletToken = crypto.randomUUID();
      await supabaseAdmin
        .from("profiles")
        .update({ wallet_token: walletToken })
        .eq("id", user.id);
    }

    // How many valid tickets the user holds (shown on the pass)
    const { count: validCount } = await supabaseAdmin
      .from("tickets")
      .select("id, orders!inner(user_id)", { count: "exact", head: true })
      .eq("orders.user_id", user.id)
      .eq("status", "VALID");

    const holderName = (profile as any).name ?? user.email ?? "Guest";

    // ── Load certs ─────────────────────────────────────────────────────────────
    let signerCert: Buffer, signerKey: Buffer, wwdr: Buffer;
    try {
      signerCert = loadCert("WALLET_CERT_BASE64", "signerCert.pem");
      signerKey  = loadCert("WALLET_KEY_BASE64",  "signerKey.pem");
      wwdr       = loadCert("WALLET_WWDR_BASE64",  "wwdr.pem");
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }

    // ── Build pass ─────────────────────────────────────────────────────────────
    const pass = new PKPass(
      {},
      {
        wwdr,
        signerCert,
        signerKey,
        signerKeyPassphrase: PASS_PHRASE,
      },
      {
        serialNumber:       walletToken,
        description:        "EventOS Wallet",
        organizationName:   "EventOS",
        passTypeIdentifier: PASS_TYPE_ID,
        teamIdentifier:     TEAM_ID,
        foregroundColor:    "rgb(250, 250, 250)",
        backgroundColor:    "rgb(9, 9, 11)",
        labelColor:         "rgb(161, 161, 170)",
      },
    );

    pass.type = "eventTicket";

    pass.primaryFields.push({
      key:   "holder",
      label: "PASS",
      value: holderName,
    });

    pass.secondaryFields.push({
      key:   "tickets",
      label: "TICKETS",
      value: String(validCount ?? 0),
    });

    pass.backFields.push(
      { key: "info",    label: "How it works", value: "Show this pass at any EventOS check-in. The scanner admits your ticket for that event." },
      { key: "support", label: "Support",      value: APP_URL },
    );

    // QR encodes the stable wallet token (NOT a ticket QR)
    pass.setBarcodes({
      message:         walletToken,
      format:          "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    });

    const buf = pass.getAsBuffer();

    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type":        "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="eventos.pkpass"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err: any) {
    console.error("[wallet]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
