import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QrManager } from "@/components/dashboard/qr-manager";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "QR Codes" };

export default async function QrPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient() as any;
  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("start_date", { ascending: false });

  return <QrManager events={(events ?? []) as { id: string; name: string }[]} />;
}
