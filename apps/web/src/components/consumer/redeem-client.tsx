"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Coins, CalendarDays, LinkIcon, MessageSquare, XCircle, type LucideIcon } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface QrResult {
  ok?: boolean;
  type?: "ONE_TIME_CREDIT" | "OPEN_EVENT" | "LINK" | "MESSAGE";
  credits?: number; balance?: number;
  eventId?: string | null; eventSlug?: string | null;
  url?: string | null; message?: string | null; label?: string | null;
  error?: string;
}

const ERR: Record<string, string> = {
  auth: "Please sign in first.",
  not_found: "This code isn't valid.",
  exhausted: "This code has been fully used.",
  already: "You've already used this code.",
};
const RESULT_ICON: Record<string, LucideIcon> = {
  ONE_TIME_CREDIT: Coins, OPEN_EVENT: CalendarDays, LINK: LinkIcon, MESSAGE: MessageSquare,
};

export function RedeemClient({ code }: { code: string }) {
  const router = useRouter();
  const [result, setResult] = useState<QrResult | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/qr/redeem", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const d = await res.json();
        const r: QrResult = res.ok ? d : { error: d.error ?? "not_found" };
        setResult(r);
        // Auto-forward for navigational codes after a brief beat.
        if (r.ok && r.type === "OPEN_EVENT" && r.eventSlug) setTimeout(() => router.replace(`/events/${r.eventSlug}`), 1200);
        if (r.ok && r.type === "LINK" && r.url) setTimeout(() => { window.location.href = r.url!; }, 1200);
      } catch { setResult({ error: "not_found" }); }
    })();
  }, [code, router]);

  // Loading
  if (!result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" style={{ background: "var(--background)" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#163300" }} />
        <p className="text-sm text-muted-foreground">Redeeming…</p>
      </div>
    );
  }

  const ok = result.ok;
  const Icon = ok && result.type ? RESULT_ICON[result.type] : XCircle;
  const head = !ok ? "Couldn't redeem"
    : result.type === "ONE_TIME_CREDIT" ? `+${result.credits} credits!`
    : result.type === "OPEN_EVENT" ? "Opening event…"
    : result.type === "LINK" ? "Opening link…"
    : (result.label ?? "Done");
  const sub = !ok ? (ERR[result.error ?? ""] ?? "Try again.")
    : result.type === "ONE_TIME_CREDIT" ? `Balance: ${result.balance} credits`
    : result.type === "MESSAGE" ? result.message
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: "var(--background)" }}>
      <span className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: ok ? "var(--pastel-green)" : "var(--pastel-rose)" }}>
        <Icon className="h-9 w-9" style={{ color: ok ? "#2C3A18" : "#4A1820" }} />
      </span>
      <h1 className="mt-5 text-3xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.02em" }}>{head}</h1>
      {sub && <p className="mt-2 max-w-xs text-muted-foreground">{sub}</p>}
      <Link href="/home" className="mt-7 rounded-full px-7 py-3 font-bold text-white" style={{ background: "#16170F" }}>
        Go to app
      </Link>
    </div>
  );
}
