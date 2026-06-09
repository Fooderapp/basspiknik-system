"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, QrCode, RotateCcw, Ticket as TicketIcon, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WalletButtons } from "@/components/consumer/wallet-buttons";

export interface WalletTicket {
  id: string;
  eventName: string;
  date: string | null;
  venue: string | null;
  cover: string | null;
  banner: string | null;
  qrCode: string;
  ticketName: string;
  tier: string | null;
  status: string;
  index: number;
  count: number;
}

/** Max ticket cards before the carousel ends with a "My Tickets" CTA card. */
const MAX_CARDS = 8;

const STATUS: Record<string, string> = {
  VALID: "#9FE870", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

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
          {/* Banner (4:1) / cover + pocket notch — 4:1 box so a 480×120 image fills exactly */}
          <div className="relative aspect-[4/1] w-full overflow-hidden bg-secondary">
            {tk.banner || tk.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(tk.banner ?? tk.cover)!} alt="" className="h-full w-full object-cover" />
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
                <Badge variant="success" className="text-[10px]">{validLabel}</Badge>
                <p className="mt-1 truncate text-sm font-medium">{tk.ticketName}</p>
                <p className="text-xs text-muted-foreground">{tk.index} / {tk.count}</p>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <QrCode className="h-3 w-3" />Tap to show QR
                </p>
              </div>
            </div>
          </div>

          {/* Status bar — bottom, coloured by state */}
          <span className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: STATUS[tk.status] ?? "#6b7280" }} />
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
          {/* Banner over the QR (when set) */}
          {tk.banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tk.banner} alt="" className="mb-4 h-12 w-full max-w-[260px] rounded-lg object-cover" />
          )}
          <p className="mb-5 text-[10px] font-semibold tracking-[3px] text-muted-foreground uppercase">
            Entry Pass
          </p>
          <p className="mb-5 text-center text-lg font-bold tracking-tight line-clamp-2">{tk.eventName}</p>

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

  const shown = tickets.slice(0, MAX_CARDS);
  const hasMore = tickets.length > MAX_CARDS;
  // Total slides = shown cards + 1 CTA card (always present as the last item).
  const slideCount = shown.length + 1;

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  return (
    <div>
      {/* Carousel */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {shown.map((tk) => (
          <div key={tk.id} className="w-full shrink-0 snap-center">
            <TicketCard tk={tk} showLabel={showLabel} validLabel={validLabel} />
          </div>
        ))}

        {/* Final CTA card → My Tickets */}
        <div className="w-full shrink-0 snap-center">
          <Link
            href="/my-tickets"
            className="group flex h-full min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center transition-colors hover:border-gold/40 hover:bg-card"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
              <TicketIcon className="h-6 w-6 text-gold" />
            </div>
            <p className="font-semibold">
              {hasMore ? `All ${tickets.length} tickets` : "My Tickets"}
            </p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              View all <ChevronRight className="h-4 w-4" />
            </p>
          </Link>
        </div>
      </div>

      {/* Dot nav */}
      {slideCount > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: slideCount }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-gold" : "w-1.5 bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      )}

      {/* Wallet buttons — uses existing /api/wallet endpoint */}
      <div className="mt-4">
        <WalletButtons appleLabel="Add to Apple Wallet" googleLabel="Add to Google Wallet" />
      </div>
    </div>
  );
}
