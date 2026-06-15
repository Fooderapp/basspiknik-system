"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { t, type Dictionary } from "@/lib/i18n";

interface ArtistCardData {
  id: string;
  slug: string;
  name: string;
  genre?: string | null;
  photo_url?: string | null;
}

export function ArtistCarousel({ artists, dict }: { artists: ArtistCardData[]; dict: Dictionary }) {
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
    const i = Math.round(track.scrollLeft / (cardWidth + 16));
    setActive(Math.min(Math.max(i, 0), artists.length - 1));
  }

  return (
    <div>
      <div className="flex justify-center">
      <div ref={trackRef} onScroll={onScroll} className="no-scrollbar inline-flex max-w-full snap-x snap-mandatory justify-start gap-4 overflow-x-auto pb-2">
        {artists.map((a) => (
          <Link key={a.id} href={`/artists/${a.slug}`} className="group w-[68vw] shrink-0 snap-start sm:w-[260px]">
            <div className="flex h-full flex-col gap-4 rounded-[2.25rem] p-2" style={{ background: "#16170F" }}>
              <div className="relative aspect-square w-full overflow-hidden rounded-[1.75rem] bg-muted">
                {a.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photo_url} alt={a.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center" style={{ background: "var(--pastel-lavender)" }}>
                    <Music2 className="h-8 w-8" style={{ color: "#2E2350" }} />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col items-center justify-between gap-3 px-2 pb-2 text-center">
                <div className="flex flex-col items-center gap-2">
                  {a.genre && (
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-medium uppercase tracking-[1px] text-[#171717]">
                      {a.genre}
                    </span>
                  )}
                  <h3 className="text-xl font-extrabold uppercase leading-tight text-white line-clamp-2">{a.name}</h3>
                </div>
                <span className="w-full rounded-full bg-brand px-4 py-3 text-sm font-bold text-brand-foreground">
                  {t(dict, "artist.view")}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      </div>
      {artists.length > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {artists.map((_, i) => (
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
