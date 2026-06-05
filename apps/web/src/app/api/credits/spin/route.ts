import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const spinSchema = z.object({
  eventId: z.string().uuid().optional(),
  context: z.enum(["TICKET", "DRINK"]),
  items: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).default([]),
});

/** Resolve an authed Supabase client from Bearer token (mobile) or cookie (web).
 *  For mobile: inject the JWT as the Authorization header so auth.uid() works in RPCs. */
async function resolveClient(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    // Create client with the user JWT baked in — auth.uid() resolves correctly in RPCs.
    const sb = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await sb.auth.getUser(token);
    return { client: sb, user };
  }
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  return { client: supabase, user };
}

// Spend credits on one spin. Outcome (win/lose) is decided server-side in the
// spin_credits RPC — the client only renders the result it is given.
// Accepts Bearer token (mobile) or cookie session (web).
export async function POST(req: Request) {
  const { client: supabase, user } = await resolveClient(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = spinSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { eventId, context, items } = parsed.data;

  const { data, error } = await (supabase as any).rpc("spin_credits", {
    p_event_id: eventId ?? null,
    p_context: context,
    p_cart: items,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error, ...data }, { status: 400 });

  return NextResponse.json(data);
}
