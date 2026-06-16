"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { VenueGlobe } from "@/components/public/venue-globe";
import type { Venue } from "@/lib/venue";
import type { Dictionary } from "@/lib/i18n";

// MapLibre touches `window` at import — load it client-only.
const VenueMap = dynamic(
  () => import("@/components/public/venue-map").then((m) => m.VenueMap),
  { ssr: false },
);

/**
 * Hybrid hero visual:
 *  1. Branded dotted globe zooms from space → the country (continents view).
 *  2. As the globe nears the country, we crossfade to a real map…
 *  3. …which flies the rest of the way down to the city and rests on a pin.
 * Auto-plays once when scrolled into view. Click the pin → popup.
 */
export function VenueExperience({
  venue,
  dict,
  lang,
}: {
  venue: Venue;
  dict: Dictionary;
  lang: "en" | "hu";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [handoff, setHandoff] = useState(false); // map mounted + flying
  const [globeGone, setGlobeGone] = useState(false); // globe fully faded out

  // Start when the hero is on screen
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setActive(true); },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // When the globe zoom passes the country threshold, hand off to the map.
  function onGlobeProgress(p: number) {
    if (p > 0.82 && !handoff) setHandoff(true);
  }

  // Once handed off, fade the globe out and unmount it after the transition.
  useEffect(() => {
    if (!handoff) return;
    const t = setTimeout(() => setGlobeGone(true), 1100);
    return () => clearTimeout(t);
  }, [handoff]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 h-full w-full"
      style={{
        maskImage: "linear-gradient(to bottom, black 74%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 74%, transparent 100%)",
      }}
    >
      {/* Real map (under) — fades in during handoff */}
      {handoff && (
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: 1 }}
        >
          <VenueMap venue={venue} dict={dict} lang={lang} fly={handoff} />
        </div>
      )}

      {/* Dotted globe (over) — fades out at handoff */}
      {!globeGone && (
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: handoff ? 0 : 1 }}
        >
          <VenueGlobe venue={venue} active={active} onProgress={onGlobeProgress} />
        </div>
      )}
    </div>
  );
}
