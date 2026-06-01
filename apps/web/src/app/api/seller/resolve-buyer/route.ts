import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify Bearer token (mobile pattern — no cookies)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single() as any;

  if (!caller || !["ADMIN", "EDITOR", "SELLER"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { walletToken } = await req.json();
  if (!walletToken) return NextResponse.json({ error: "walletToken required" }, { status: 400 });

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email")
    .eq("wallet_token", walletToken)
    .single() as any;

  if (error || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ id: profile.id, name: profile.name, email: profile.email });
}
