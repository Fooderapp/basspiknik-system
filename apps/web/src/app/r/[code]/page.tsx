import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RedeemClient } from "@/components/consumer/redeem-client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Redeem" };

// Deep-link target for scannable QR codes. A user's default phone camera opens
// https://<app>/r/<code> → we redeem it for the signed-in user.
export default async function RedeemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient() as any;

  // Event codes open the public event page — no login required.
  const { data: peek } = await supabase.rpc("qr_peek", { p_code: code });
  if (peek?.type === "OPEN_EVENT" && peek.eventSlug) {
    redirect(`/events/${peek.eventSlug}`);
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Not registered/signed in: don't silently bounce — tell them an account is
  // needed to claim, then send them back here to redeem after auth.
  if (!user) {
    const back = encodeURIComponent(`/r/${code}`);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: "#F6F5EE" }}>
        <span className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "var(--pastel-gold)" }}>
          <Lock className="h-9 w-9" style={{ color: "#3A3608" }} />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
          Account needed
        </h1>
        <p className="mt-2 max-w-xs text-muted-foreground">
          Sign in or create a free account to claim this code and your credits.
        </p>
        <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
          <Link href={`/sign-in?redirectTo=${back}`} className="rounded-full px-7 py-3 font-bold text-white" style={{ background: "#16170F" }}>
            Sign in
          </Link>
          <Link href={`/sign-up?redirectTo=${back}`} className="rounded-full border px-7 py-3 font-bold" style={{ borderColor: "#D8D6C8" }}>
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return <RedeemClient code={code} />;
}
