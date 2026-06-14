import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RedeemClient } from "@/components/consumer/redeem-client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Redeem" };

// Deep-link target for scannable QR codes. A user's default phone camera opens
// https://<app>/r/<code> → we redeem it for the signed-in user.
export default async function RedeemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?redirectTo=${encodeURIComponent(`/r/${code}`)}`);
  return <RedeemClient code={code} />;
}
