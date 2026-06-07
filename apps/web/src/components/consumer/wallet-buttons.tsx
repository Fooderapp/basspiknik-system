"use client";

import { useState } from "react";
import { Apple, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function WalletButtons({ appleLabel, googleLabel }: { appleLabel: string; googleLabel: string }) {
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  async function open(kind: "apple" | "google") {
    setBusy(kind);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const path = kind === "apple" ? "/api/wallet" : "/api/google-wallet";
      window.location.href = `${path}?token=${encodeURIComponent(session.access_token)}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 mb-5">
      <Button
        variant="secondary"
        className="w-full gap-2"
        onClick={() => open("apple")}
        disabled={busy !== null}
      >
        <Apple className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {appleLabel}
      </Button>
      <Button
        variant="secondary"
        className="w-full gap-2"
        onClick={() => open("google")}
        disabled={busy !== null}
      >
        <Wallet className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {googleLabel}
      </Button>
    </div>
  );
}
