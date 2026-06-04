import { NextResponse } from "next/server";
import { z } from "zod";
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

// Spend credits on one spin. Outcome (win/lose) is decided server-side in the
// spin_credits RPC — the client only renders the result it is given.
export async function POST(req: Request) {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = spinSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { eventId, context, items } = parsed.data;

  const { data, error } = await supabase.rpc("spin_credits", {
    p_event_id: eventId ?? null,
    p_context: context,
    p_cart: items,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error, ...data }, { status: 400 });

  return NextResponse.json(data);
}
