import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

// Google Wallet Generic pass for Bass Piknik.
// Each user gets one pass — QR encodes their wallet_token.
// At the door, staff scan the QR and check in the user's ticket.
//
// Required env vars:
//   GOOGLE_WALLET_ISSUER_ID     — from pay.google.com/business/console
//   GOOGLE_WALLET_CLASS_SUFFIX  — e.g. "eventosticket" (you choose)
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — the "private_key" field from service account JSON
//                                         (with \n as literal newlines, or base64-encoded)

const ISSUER_ID     = process.env.GOOGLE_WALLET_ISSUER_ID ?? "";
const CLASS_SUFFIX  = process.env.GOOGLE_WALLET_CLASS_SUFFIX ?? "eventosticket";
const SA_EMAIL      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
const SA_KEY_RAW    = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Private key may be stored as base64 (Vercel) or with literal \n
function parsePrivateKey(raw: string): string {
  if (raw.startsWith("-----")) return raw.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (decoded.startsWith("-----")) return decoded;
  } catch {}
  return raw.replace(/\\n/g, "\n");
}

export async function GET(req: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const url        = new URL(req.url);
    const authHeader = req.headers.get("authorization");
    const queryToken = url.searchParams.get("token");
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Load profile + wallet token ────────────────────────────────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, wallet_token")
      .eq("id", user.id)
      .single() as { data: { full_name: string | null; wallet_token: string | null } | null };

    let walletToken = profile?.wallet_token;
    if (!walletToken) {
      // Migration 013 should have backfilled this, but auto-heal if missing.
      walletToken = crypto.randomUUID();
      await supabaseAdmin
        .from("profiles")
        .update({ wallet_token: walletToken })
        .eq("id", user.id);
    }

    // ── Check env vars ─────────────────────────────────────────────────────
    if (!ISSUER_ID || !SA_EMAIL || !SA_KEY_RAW) {
      return NextResponse.json(
        { error: "Google Wallet not configured — set GOOGLE_WALLET_ISSUER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" },
        { status: 500 },
      );
    }

    const privateKey  = parsePrivateKey(SA_KEY_RAW);
    const classId     = `${ISSUER_ID}.${CLASS_SUFFIX}`;
    const objectId    = `${ISSUER_ID}.user_${user.id.replace(/-/g, "_")}`;

    // ── Build Generic pass object ──────────────────────────────────────────
    // https://developers.google.com/wallet/generic/rest/v1/genericobject
    const genericObject = {
      id: objectId,
      classId,
      genericType: "GENERIC_TYPE_UNSPECIFIED",
      cardTitle: {
        defaultValue: { language: "en-US", value: "Bass Piknik" },
      },
      header: {
        defaultValue: { language: "en-US", value: profile?.full_name ?? "Passport" },
      },
      barcode: {
        type: "QR_CODE",
        value: walletToken,
        alternateText: "",
      },
      heroImage: {
        sourceUri: { uri: `${APP_URL}/pass-hero.png` },
        contentDescription: {
          defaultValue: { language: "en-US", value: "BASSPIKNIK" },
        },
      },
      hexBackgroundColor: "#3f6912",
      state: "ACTIVE",
    };

    // ── Class definition (auto-created by Google on first save) ───────────
    const genericClass = {
      id: classId,
      issuerName: "BASSPIKNIK",
    };

    // ── Sign JWT ───────────────────────────────────────────────────────────
    const claims = {
      iss: SA_EMAIL,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: [APP_URL],
      payload: {
        genericClasses: [genericClass],
        genericObjects: [genericObject],
      },
    };

    const token = jwt.sign(claims, privateKey, { algorithm: "RS256" });
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    // Redirect to Google Wallet save URL — Android opens the Wallet app
    return NextResponse.redirect(saveUrl, 302);
  } catch (err: any) {
    console.error("[google-wallet]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
