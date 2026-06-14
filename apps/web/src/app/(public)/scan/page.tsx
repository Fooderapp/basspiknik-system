import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QrScanClient } from "@/components/consumer/qr-scan-client";

export const metadata = { title: "Scan" };

export default async function ScanPage() {
  const supabase = await createClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?redirectTo=/scan");
  return <QrScanClient />;
}
