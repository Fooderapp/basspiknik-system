import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve the calling staff member from cookie (web) or Bearer token (mobile). */
async function getCaller(req: Request): Promise<{ id: string; role: string } | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const sb = createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return null;
    const admin = createAdminClient() as any;
    const { data } = await admin.from("profiles").select("id, role").eq("id", user.id).single();
    return data ?? null;
  }
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  return data ?? null;
}

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller || !["ADMIN", "EDITOR", "SELLER"].includes(caller.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { walletToken } = await req.json();
  if (!walletToken) return NextResponse.json({ error: "walletToken required" }, { status: 400 });

  const supabaseAdmin = createAdminClient() as any;
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, billing_name, billing_address, billing_city, billing_postal_code, billing_country")
    .eq("wallet_token", walletToken)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    billing_name: profile.billing_name,
    billing_address: profile.billing_address,
    billing_city: profile.billing_city,
    billing_postal_code: profile.billing_postal_code,
    billing_country: profile.billing_country,
  });
}
