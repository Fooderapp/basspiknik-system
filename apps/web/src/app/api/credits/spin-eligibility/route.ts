import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/credits/spin-eligibility
 * Body: { eventId, items: [{ ticketTypeId, quantity }] }
 *
 * Side-effect-free mirror of the spin_credits RPC's pre-checks, so the buy page
 * can HIDE the spin CTA when conditions aren't met (instead of letting the user
 * tap and fail). Returns { eligible, reason, balance, cost }.
 */
const schema = z.object({
  eventId: z.string(),
  items: z.array(z.object({ ticketTypeId: z.string(), quantity: z.number().min(0) })).default([]),
});

async function resolveUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const sb = createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: { user } } = await sb.auth.getUser(token);
    return user ?? null;
  }
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

const no = (reason: string, extra: object = {}) => NextResponse.json({ eligible: false, reason, ...extra });

export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return no("not_authenticated");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return no("invalid_request");
  const { eventId, items } = parsed.data;

  const admin = createAdminClient() as any;
  const [{ data: balanceRaw }, { data: settings }, { data: cfg }] = await Promise.all([
    admin.rpc("get_credit_balance", { p_user_id: user.id }),
    admin.from("app_settings").select("credits_enabled, spin_cost").eq("id", "global").single(),
    admin.from("event_spin_config").select("*").eq("event_id", eventId).single(),
  ]);

  const balance = typeof balanceRaw === "number" ? balanceRaw : 0;
  const cost = settings?.spin_cost ?? 4;

  if (!settings?.credits_enabled) return no("credits_disabled", { balance, cost });
  if (!cfg || !cfg.enabled) return no("spin_not_enabled", { balance, cost });

  const cart = items.filter((i) => i.quantity > 0);
  if (cart.length === 0) return no("empty_cart", { balance, cost });

  // Load ticket types in the cart (allowed-type + bundle checks)
  const ids = cart.map((i) => i.ticketTypeId);
  const { data: tts } = await admin
    .from("ticket_types").select("id, is_bundle, bundle_size").in("id", ids);
  const ttMap = new Map<string, any>((tts ?? []).map((t: any) => [t.id, t]));

  const allowed: string[] = cfg.allowed_ticket_type_ids ?? [];
  let totalQty = 0;
  let bundleQty = 0;
  for (const item of cart) {
    const tt = ttMap.get(item.ticketTypeId);
    if (!tt) return no("invalid_cart", { balance, cost });
    if (allowed.length > 0 && !allowed.includes(tt.id)) return no("ineligible_tickets", { balance, cost });
    totalQty += item.quantity;
    if (tt.is_bundle) bundleQty += item.quantity;
  }

  if (cfg.max_cart_items > 0 && totalQty > cfg.max_cart_items) return no("too_many_items", { balance, cost });
  if (cfg.require_bundle && bundleQty < Math.max(cfg.min_bundles ?? 0, 1)) return no("bundle_required", { balance, cost });
  if (balance < cost) return no("insufficient_credits", { balance, cost });

  return NextResponse.json({ eligible: true, reason: null, balance, cost });
}
