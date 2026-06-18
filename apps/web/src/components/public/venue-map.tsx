"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Venue } from "@/lib/venue";
import type { Dictionary } from "@/lib/i18n";

// OpenFreeMap Positron — free vector tiles, no API key, same clean aesthetic
// as Mapbox Light. See https://openfreemap.org for terms.
const POSITRON_STYLE = "https://tiles.openfreemap.org/styles/positron";

export function VenueMap({
  venue,
  dict,
  lang,
  fly,
}: {
  venue: Venue;
  dict: Dictionary;
  lang: "en" | "hu";
  /** When true, animate the zoom from country level down to the city. */
  fly: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinElRef = useRef<HTMLElement | null>(null);
  const flownRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  // Mount the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: POSITRON_STYLE,
      center: [venue.lng, venue.lat],
      zoom: 4.4,
      interactive: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.once("load", () => setMapLoaded(true));

    // MapLibre owns `wrapper`'s transform for positioning — never touch it.
    // Animate `inner` instead so the spring bounce doesn't override positioning.
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;width:36px;height:50px;";

    const inner = document.createElement("div");
    inner.style.cssText = "opacity:0;transform:translateY(20px) scale(0.4);position:relative;width:36px;height:50px;";
    pinElRef.current = inner;

    // Pulsing ring behind the pin
    const ring = document.createElement("div");
    ring.style.cssText = [
      "position:absolute;bottom:0;left:50%;",
      "width:28px;height:28px;border-radius:50%;",
      "background:rgba(199,224,74,0.35);",
      "transform:translateX(-50%);",
      "animation:pinPulse 2s ease-out 0.6s infinite",
    ].join("");
    inner.appendChild(ring);

    const btn = document.createElement("button");
    btn.setAttribute("aria-label", venue.name);
    btn.style.cssText = "border:0;background:transparent;cursor:pointer;padding:0;display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))";
    btn.innerHTML = `
      <svg width="36" height="50" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0Z" fill="#C7E04A"/>
        <circle cx="15" cy="15" r="6.2" fill="#16170F"/>
      </svg>`;
    btn.addEventListener("click", () => setOpen(true));
    inner.appendChild(btn);
    wrapper.appendChild(inner);

    new maplibregl.Marker({ element: wrapper, anchor: "bottom" })
      .setLngLat([venue.lng, venue.lat])
      .addTo(map);

    return () => { map.remove(); mapRef.current = null; pinElRef.current = null; };
  }, [venue]);

  // Fly once both the map is loaded AND the handoff has been triggered.
  useEffect(() => {
    const map = mapRef.current;
    if (!fly || !mapLoaded || flownRef.current || !map) return;
    flownRef.current = true;
    // padding.bottom = 50% of container height → MapLibre places the focal
    // point (venue pin) at the centre of the top half = ~25% from top,
    // which is above the hero fade line on every screen size.
    const h = map.getContainer().clientHeight;
    map.flyTo({
      center: [venue.lng, venue.lat],
      zoom: 14,
      duration: 3000,
      curve: 1.5,
      essential: true,
      padding: { top: 0, bottom: Math.round(h * 0.5), left: 0, right: 0 },
    });
    // Bounce the pin in once the camera settles
    map.once("moveend", () => {
      const pin = pinElRef.current;
      if (!pin) return;
      pin.style.transition = "opacity 0.35s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)";
      pin.style.opacity = "1";
      pin.style.transform = "translateY(0) scale(1)";
    });
  }, [fly, mapLoaded, venue]);

  return (
    <div className="absolute inset-0 h-full w-full">
      <style>{`
        @keyframes pinPulse {
          0%   { transform: translateX(-50%) scale(1);   opacity: 0.6; }
          100% { transform: translateX(-50%) scale(2.6); opacity: 0; }
        }
      `}</style>
      <div ref={containerRef} className="h-full w-full" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl overflow-hidden border-0 p-0"
          style={{ background: "#000", borderRadius: 36 }}
        >
          {/* visually hidden accessible title */}
          <DialogHeader className="sr-only">
            <DialogTitle>{venue.name}</DialogTitle>
            <DialogDescription>{venue.description[lang]}</DialogDescription>
          </DialogHeader>

          <div className="grid h-[480px] grid-cols-2">
            {/* ── Left: photo ── */}
            <div className="p-2">
              <div className="relative h-full overflow-hidden rounded-[27px] bg-[#262626]">
                {venue.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={venue.images[0]}
                    alt={venue.name}
                    className="absolute inset-0 h-[115%] w-full max-w-none -top-[7.5%] object-cover"
                  />
                ) : (
                  <>
                    <div
                      className="h-full w-full"
                      style={{ background: "radial-gradient(circle at 30% 20%, #3C7A1E 0%, #16170F 85%)" }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.svg" alt={venue.name} className="absolute bottom-5 left-5 h-8 w-auto opacity-90" />
                  </>
                )}
                <div className="pointer-events-none absolute inset-0 rounded-[27px] shadow-[inset_0_0_0_1px_#262626]" />
              </div>
            </div>

            {/* ── Right: info ── */}
            <div className="flex flex-col overflow-hidden">
              <div className="relative flex-1 overflow-hidden">
                <div className="h-full overflow-auto p-8">
                  <p className="mb-5 text-center text-base font-medium text-white">{venue.name}</p>
                  <p className="text-[11px] leading-[1.5] text-[#E5E5E5]">{venue.description[lang]}</p>
                </div>
                {/* fade to black */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black to-transparent" />
              </div>
              <div className="p-4">
                <a
                  href={venue.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center rounded-full py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: "#1966FF" }}
                >
                  {dict["location.directions"]}
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
