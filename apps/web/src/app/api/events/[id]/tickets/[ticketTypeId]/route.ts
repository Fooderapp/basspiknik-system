import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, TicketType } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  price: z.number().min(0).optional(),
  quantity: z.number().min(1).optional(),
  tier: z.enum(["EARLY_BIRD", "GENERAL", "LATE", "DOOR", "VIP", "FREE"]).optional(),
  maxPerOrder: z.number().min(1).optional(),
  entriesPerTicket: z.number().int().min(1).optional(),
  saleStartsAt: z.string().optional().nullable(),
  saleEndsAt: z.string().optional().nullable(),
  isBundle: z.boolean().optional(),
  bundleSize: z.number().int().min(2).optional().nullable(),
  isDoorTicket: z.boolean().optional(),
  isVipTicket: z.boolean().optional(),
  saleEnabled: z.boolean().optional(),
  salePrice: z.number().min(0).optional().nullable(),
  isVisible: z.boolean().optional(),
  visibleFrom: z.string().optional().nullable(),
  visibleUntil: z.string().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; ticketTypeId: string }> }
) {
  const { ticketTypeId } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, description, imageUrl, price, quantity, tier, maxPerOrder, entriesPerTicket,
          saleStartsAt, saleEndsAt, isBundle, bundleSize, isDoorTicket, isVipTicket, saleEnabled, salePrice,
          isVisible, visibleFrom, visibleUntil } = parsed.data;

  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("ticket_types")
    .update({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(imageUrl !== undefined && { image_url: imageUrl }),
      ...(price !== undefined && { price }),
      ...(quantity !== undefined && { quantity }),
      ...(tier !== undefined && { tier }),
      ...(maxPerOrder !== undefined && { max_per_order: maxPerOrder }),
      ...(entriesPerTicket !== undefined && { entries_per_ticket: entriesPerTicket }),
      ...(saleStartsAt !== undefined && { sale_starts_at: saleStartsAt }),
      ...(saleEndsAt !== undefined && { sale_ends_at: saleEndsAt }),
      ...(isBundle !== undefined && { is_bundle: isBundle }),
      ...(bundleSize !== undefined && { bundle_size: bundleSize }),
      ...(isDoorTicket !== undefined && { is_door_ticket: isDoorTicket }),
      ...(isVipTicket !== undefined && { is_vip_ticket: isVipTicket }),
      ...(saleEnabled !== undefined && { sale_enabled: saleEnabled }),
      ...(salePrice !== undefined && { sale_price: salePrice }),
      ...(isVisible !== undefined && { is_visible: isVisible }),
      ...(visibleFrom !== undefined && { visible_from: visibleFrom || null }),
      ...(visibleUntil !== undefined && { visible_until: visibleUntil || null }),
    })
    .eq("id", ticketTypeId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as TicketType);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; ticketTypeId: string }> }
) {
  const { ticketTypeId } = await params;
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = createAdminClient() as any;

  // Check if any tickets sold — don't allow deletion if sold > 0
  const { data: tt } = await supabase
    .from("ticket_types")
    .select("sold")
    .eq("id", ticketTypeId)
    .single();

  if (tt?.sold > 0) {
    return NextResponse.json(
      { error: "Cannot delete a ticket type with sales. Set quantity to match sold count to close it." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("ticket_types").delete().eq("id", ticketTypeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
