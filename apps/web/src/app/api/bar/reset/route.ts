import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

/** Delete all drink orders (and their items via cascade). ADMIN only. */
export async function POST() {
  const profile = await getProfile();
  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = createAdminClient() as any;

  // Delete items first in case DB doesn't cascade
  await supabase.from("drink_order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabase.from("drink_orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
