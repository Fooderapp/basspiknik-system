"use client";

import { useRef, useState } from "react";
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
