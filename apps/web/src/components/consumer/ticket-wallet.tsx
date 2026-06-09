"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { CalendarDays, MapPin, QrCode, RotateCcw } from "lucide-react";
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
  index: number;
  count: number;
}

const STATUS: Record<string, string> = {
  VALID: "#9FE870", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

type WalletPlatform = "ios" | "android" | "other";

// ─── Single flippable + tiltable card ────────────────────────────────────────
function TicketCard({
  tk,
  showLabel,
  validLabel,
}: {
  tk: WalletTicket;
  showLabel: string;
  validLabel: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);   // -1 to 1
      const dy = (e.clientY - cy) / (rect.height / 2);  // -1 to 1
      el.style.setProperty("--rx", `${(-dy * 6).toFixed(1)}deg`);
      el.style.setProperty("--ry", `${(dx * 6).toFixed(1)}deg`);
      el.style.setProperty("--sheen", `${((dx + 1) / 2 * 100).toFixed(0)}%`);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--sheen", "50%");
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        // CSS custom props for tilt
        "--rx": "0deg",
        "--ry": "0deg",
        "--sheen": "50%",
        perspective: "1200px",
        flexShrink: 0,
        width: "100%",
      } as React.CSSProperties}
    >
      {/* flip container */}
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transform: flipped
            ? "rotateX(var(--rx)) rotateY(calc(var(--ry) + 180deg))"
            : "rotateX(var(--rx)) rotateY(var(--ry))",
          transition: "transform 0.65s cubic-bezier(0.23, 1, 0.32, 1)",
          cursor: "pointer",
          borderRadius: "24px",
        }}
        onClick={() => setFlipped((f) => !f)}
      >
        {/* ── FRONT FACE ── */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
          className="relative overflow-hidden rounded-3xl border border-border bg-card text-left"
        >
          {/* Cover + pocket notch */}
          <div className="relative h-28 w-full overflow-hidden bg-secondary">
            {tk.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tk.cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-gold/30 to-brand/20" />
            )}
            <div className="absolute -bottom-3 left-1/2 h-6 w-28 -translate-x-1/2 rounded-t-full bg-card" />

            {/* Specular sheen */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)",
                backgroundPositionX: "var(--sheen)",
                backgroundSize: "200% 100%",
                transition: "background-position-x 0.1s",
              }}
            />
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
                  <QrCode className="h-3 w-3" />Tap to show QR
                </p>
              </div>
            </div>
          </div>

          {/* Status stripe */}
          <span className="absolute right-0 top-0 h-full w-1" style={{ backgroundColor: STATUS[tk.status] ?? "#6b7280" }} />
        </div>

        {/* ── BACK FACE ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: "24px",
          }}
          className="flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-card p-8"
        >
          <p className="mb-5 text-[10px] font-semibold tracking-[3px] text-muted-foreground uppercase">
            Entry Pass
          </p>
          <p className="mb-1 text-center text-lg font-bold tracking-tight line-clamp-2">{tk.eventName}</p>
          {tk.tier && <p className="mb-5 text-xs text-muted-foreground">{tk.tier.replace("_", " ")}</p>}

          {/* Large QR */}
          <div
            className="rounded-2xl bg-white p-4"
            style={{ boxShadow: "0 0 32px rgba(235,224,90,0.2)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/tickets/qr?code=${encodeURIComponent(tk.qrCode)}`}
              alt="QR"
              width={196}
              height={196}
              className="block"
            />
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
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

          <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <RotateCcw className="h-3 w-3" />Tap to flip back
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Carousel wrapper ─────────────────────────────────────────────────────────
export function TicketWallet({
  tickets,
  showLabel,
  validLabel,
}: {
  tickets: WalletTicket[];
  showLabel: string;
  validLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [platform, setPlatform] = useState<WalletPlatform>("other");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");
  }, []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  const activeTicket = tickets[active] ?? null;

  return (
    <div>
      {/* Carousel */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {tickets.map((tk) => (
          <div key={tk.id} className="w-full shrink-0 snap-center">
            <TicketCard tk={tk} showLabel={showLabel} validLabel={validLabel} />
          </div>
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

      {/* ONE wallet button for active ticket */}
      {activeTicket && (platform === "ios" || platform === "android") && (
        <a
          href={
            platform === "ios"
              ? `/api/tickets/${activeTicket.id}/pass`
              : `/api/tickets/${activeTicket.id}/google-wallet`
          }
          target={platform === "android" ? "_blank" : undefined}
          rel={platform === "android" ? "noopener noreferrer" : undefined}
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-border bg-secondary/50 py-3 text-[13px] font-semibold transition-colors hover:border-gold/30 hover:bg-gold/5"
        >
          {platform === "ios" ? (
            <>
              {/* Apple Wallet logo mark */}
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Add to Apple Wallet
            </>
          ) : (
            <>
              {/* Google "G" */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Add to Google Wallet
            </>
          )}
        </a>
      )}
    </div>
  );
}
