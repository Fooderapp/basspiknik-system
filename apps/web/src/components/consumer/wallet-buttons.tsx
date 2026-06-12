"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/** Real Apple logo mark (monochrome — inherits currentColor). */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.1 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

/** Real Google "G" 4-colour logo. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

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
    <div className="mb-5 mt-4 flex flex-col gap-2">
      <button
        onClick={() => open("apple")}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: "#16170F" }}
      >
        <AppleLogo className="h-[18px] w-[18px]" />
        {appleLabel}
      </button>
      <button
        onClick={() => open("google")}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-bold disabled:opacity-50"
        style={{ background: "#fff", borderColor: "#E2E0D4" }}
      >
        <GoogleLogo className="h-[18px] w-[18px]" />
        {googleLabel}
      </button>
    </div>
  );
}
