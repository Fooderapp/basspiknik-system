"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatDate } from "@/lib/utils";
import { t, type Dictionary } from "@/lib/i18n";

interface EventCardData {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  cover_image_url?: string | null;
  home_cover_image_url?: string | null;
  soon: boolean;
}

export function EventCarousel({ events, dict }: { events: EventCardData[]; dict: Dictionary }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function scrollToIndex(i: number) {
    const track = trackRef.current;
    const card = track?.children[i] as HTMLElement | undefined;
    if (track && card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setActive(i);
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const cardWidth = (track.children[0] as HTMLElement | undefined)?.clientWidth || 1;
    const i = Math.round(track.scrollLeft / cardWidth);
    setActive(Math.min(Math.max(i, 0), events.length - 1));
  }

  return (
    <div>
      <div className="flex justify-center">
      <div ref={trackRef} onScroll={onScroll} className="no-scrollbar inline-flex max-w-full snap-x snap-mandatory justify-start gap-4 overflow-x-auto pb-2">
        {events.map((ev) => {
          const badge = ev.soon ? t(dict, "home.coming_soon") : formatDate(ev.start_date);
          const card = (
            <div className="group relative flex aspect-[4/5] w-[78vw] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[2.25rem] bg-muted sm:w-[320px]">
              {ev.home_cover_image_url || ev.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.home_cover_image_url || ev.cover_image_url || ""} alt={ev.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="absolute inset-0" style={{ background: "var(--pastel-green)" }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <div className="relative flex flex-col items-center gap-4 p-8 text-center">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[1px] text-white backdrop-blur-sm">
                  {badge}
                </span>
                <h3 className="text-2xl font-extrabold uppercase leading-tight text-white line-clamp-2">{ev.name}</h3>
                <span className="rounded-full bg-white px-6 py-3 text-sm font-medium text-[#171717]">
                  {ev.soon ? t(dict, "home.coming_soon") : t(dict, "home.buy_tickets")}
                </span>
              </div>
            </div>
          );
          return ev.soon ? (
            <div key={ev.id}>{card}</div>
          ) : (
            <Link key={ev.id} href={`/events/${ev.slug}`}>{card}</Link>
          );
        })}
      </div>
      </div>
      {events.length > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {events.map((_, i) => (
            <button
              key={i}
              aria-label={`Slide ${i + 1}`}
              onClick={() => scrollToIndex(i)}
              className="h-2 w-2 rounded-full transition-colors"
              style={{ background: i === active ? "#171717" : "rgba(23, 23, 23, 0.2)" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
