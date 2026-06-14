import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({ code: z.string().min(1).max(200) });

/** Redeem a scanned QR code. Runs redeem_qr_code() as the signed-in user
 *  (cookie on web, Bearer on mobile). */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // A scanned QR may embed a full URL (…/r/<code>) or the bare code — extract it.
  let code = parsed.data.code.trim();
  const m = code.match(/[?&]c=([^&]+)/) ?? code.match(/\/r\/([^/?#]+)/);
  if (m) code = decodeURIComponent(m[1]);

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const sb: any = token
    ? createSbClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      )
    : await createClient();

  const { data, error } = await sb.rpc("redeem_qr_code", { p_code: code });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json(data);
}
