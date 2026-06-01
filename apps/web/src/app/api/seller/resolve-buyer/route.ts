import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // Verify caller is a seller/admin (Bearer token from mobile)
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single() as any;

  if (!caller || !["ADMIN", "EDITOR", "SELLER"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { walletToken } = await req.json();
  if (!walletToken) return NextResponse.json({ error: "walletToken required" }, { status: 400 });

  const admin = await createAdminClient() as any;
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, name, email")
    .eq("wallet_token", walletToken)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ id: profile.id, name: profile.name, email: profile.email });
}
