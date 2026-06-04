import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId, identifier } = await req.json();
  if (!ticketId || !identifier) {
    return NextResponse.json({ error: "ticketId and identifier required" }, { status: 400 });
  }

  // Step 1: resolve the identifier to a profile
  const { data: lookupData, error: lookupErr } = await supabase.rpc("look_up_user", {
    p_identifier: identifier.trim(),
  });
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (lookupData?.error) return NextResponse.json({ error: lookupData.error }, { status: 404 });

  // Step 2: transfer
  const { data, error } = await supabase.rpc("transfer_ticket", {
    p_ticket_id:     ticketId,
    p_to_identifier: lookupData.displayId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 400 });

  return NextResponse.json({
    recipientName: data.recipientName,
    displayId:     data.displayId,
  });
}
