import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: Request) {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const identifier = new URL(req.url).searchParams.get("identifier");
  if (!identifier) return NextResponse.json({ error: "identifier required" }, { status: 400 });

  const { data, error } = await supabase.rpc("look_up_user", {
    p_identifier: identifier.trim(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 404 });

  return NextResponse.json({ id: data.id, name: data.name, displayId: data.displayId });
}
