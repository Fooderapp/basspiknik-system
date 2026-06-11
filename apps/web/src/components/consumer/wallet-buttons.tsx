"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/** Real Apple logo mark (monochrome — inherits currentColor). */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.98-.84.94-2.2 1.66-3.34 1.57-.14-1.12.43-2.3 1.1-3.04.84-.94 2.32-1.62 3.36-1.51zm4.335 15.77c-.6 1.38-.9 1.99-1.66 3.2-1.07 1.68-2.58 3.78-4.45 3.79-1.66.02-2.08-1.08-4.33-1.07-2.25.01-2.72 1.09-4.38 1.07-1.87-.02-3.3-1.9-4.37-3.58-2.97-4.64-3.28-10.08-1.45-12.97.95-1.5 2.46-2.37 3.88-2.37 1.45 0 2.36.8 3.56.8 1.16 0 1.87-.8 3.55-.8 1.27 0 2.61.69 3.57 1.88-3.14 1.72-2.63 6.21.91 7.43z" />
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
