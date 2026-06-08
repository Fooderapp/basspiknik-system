"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface WalletTicket {
  id: string;
  eventName: string;
  date: string | null;
  venue: string | null;
  cover: string | null;
  qrCode: string;
  ticketName: string;
  tier: string | null;
  status: string;
  index: number; // 1-based position within its order
  count: number; // total tickets in that order
}

const STATUS: Record<string, string> = {
  VALID: "#9FE870", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

type WalletPlatform = "ios" | "android" | "other";

export function TicketWallet({
  tickets,
  showLabel,
  validLabel,
}: {
  tickets: WalletTicket[];
  showLabel: string;
  validLabel: string;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [platform, setPlatform] = useState<WalletPlatform>("other");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      setPlatform("ios");
    } else if (/Android/.test(ua)) {
      setPlatform("android");
    }
  }, []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  return (
    <div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {tickets.map((tk) => (
          <button
            key={tk.id}
            onClick={() => router.push(`/tickets/${tk.id}`)}
            className="group relative w-full shrink-0 snap-center overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-gold/40"
          >
            {/* Cover with centered pocket notch */}
            <div className="relative h-28 w-full overflow-hidden bg-secondary">
              {tk.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tk.cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-gold/30 to-brand/20" />
              )}
              {/* pocket notch — card-coloured dip tucking into the cover */}
              <div className="absolute -bottom-3 left-1/2 h-6 w-28 -translate-x-1/2 rounded-t-full bg-card" />
            </div>

            <div className="p-5">
              <p className="truncate text-xl font-bold tracking-tight">{tk.eventName}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {tk.date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />{tk.date}
                  </span>
                )}
                {tk.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /><span className="line-clamp-1">{tk.venue}</span>
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="shrink-0 rounded-xl bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/tickets/qr?code=${encodeURIComponent(tk.qrCode)}`}
                    alt="QR"
                    width={76}
                    height={76}
                    className="block"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tk.tier && <Badge variant="secondary" className="text-[10px]">{tk.tier.replace("_", " ")}</Badge>}
                    <Badge variant="success" className="text-[10px]">{validLabel}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{tk.ticketName}</p>
                  <p className="text-xs text-muted-foreground">{tk.index} / {tk.count}</p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <QrCode className="h-3 w-3" />{showLabel}
                  </p>
                </div>
              </div>

              {/* Wallet button — platform-detected */}
              {platform === "ios" && (
                <a
                  href={`/api/tickets/${tk.id}/pass`}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-2.5 text-[13px] font-semibold transition-colors hover:border-gold/40 hover:bg-gold/5"
                >
                  {/* Apple Wallet logo */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c4.411 0 8 3.589 8 8s-3.589 8-8 8-8-3.589-8-8 3.589-8 8-8zm-1 3v2H9v2h2v2h2v-2h2v-2h-2V7h-2z"/></svg>
                  Add to Apple Wallet
                </a>
              )}
              {platform === "android" && (
                <a
                  href={`/api/tickets/${tk.id}/google-wallet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-2.5 text-[13px] font-semibold transition-colors hover:border-gold/40 hover:bg-gold/5"
                >
                  {/* Google Wallet G logo */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Add to Google Wallet
                </a>
              )}
            </div>
            {/* status accent stripe */}
            <span className="absolute right-0 top-0 h-full w-1" style={{ backgroundColor: STATUS[tk.status] ?? "#6b7280" }} />
          </button>
        ))}
      </div>

      {/* Dot nav */}
      {tickets.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {tickets.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-gold" : "w-1.5 bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
