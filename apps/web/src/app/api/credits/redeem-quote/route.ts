import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  orderTotal: z.number().min(0),
  requested: z.number().int().min(0).optional(),
});

/** Client slider preview: how many credits can be applied to an order of this
 *  total, and the resulting discount. Runs as the signed-in user (cookie on web,
 *  Bearer on mobile) so the SQL `credit_redeem_quote` sees auth.uid(). The
 *  authoritative cap for the actual charge is recomputed server-side in the
 *  checkout / payment-intent routes (see lib/credits.ts). */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { orderTotal, requested } = parsed.data;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let sb: any;
  if (token) {
    sb = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
  } else {
    sb = await createClient();
  }

  const { data, error } = await sb.rpc("credit_redeem_quote", {
    p_order_total: orderTotal,
    p_requested: requested ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { enabled: false });
}
