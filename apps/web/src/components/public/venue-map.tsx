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
  const loadedRef = useRef(false);
  const flyReqRef = useRef(false);
  const flownRef = useRef(false);
  const [open, setOpen] = useState(false);

  // Fly down to the city — only once, and only after the map has loaded.
  function doFly() {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !flyReqRef.current || flownRef.current) return;
    flownRef.current = true;
    const h = map.getContainer().clientHeight;
    map.flyTo({
      center: [venue.lng, venue.lat],
      zoom: 14, // close enough to read the lake, streets & the venue
      duration: 3000,
      curve: 1.5,
      essential: true,
      // Push the pin up into the clear zone ABOVE the hero subheadline.
      padding: { top: 0, bottom: Math.round(h * 0.5), left: 0, right: 0 },
    });
  }

  // Mount the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: POSITRON_STYLE,
      center: [venue.lng, venue.lat],
      zoom: 4.4, // country level — matches where the globe handed off
      interactive: false, // hero backdrop: no scroll/drag trap
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.once("load", () => { loadedRef.current = true; doFly(); });

    // Brand pin marker
    const el = document.createElement("button");
    el.setAttribute("aria-label", venue.name);
    el.style.cssText =
      "width:30px;height:42px;border:0;background:transparent;cursor:pointer;transform:translateY(-6px);filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))";
    el.innerHTML = `
      <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0Z" fill="#C7E04A"/>
        <circle cx="15" cy="15" r="6.2" fill="#16170F"/>
      </svg>`;
    el.addEventListener("click", () => setOpen(true));
    new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([venue.lng, venue.lat])
      .addTo(map);

    return () => { map.remove(); mapRef.current = null; };
  }, [venue]);

  // Fly in to the city when triggered
  useEffect(() => {
    flyReqRef.current = fly;
    if (fly) doFly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly]);

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg overflow-hidden rounded-3xl p-0">
          {venue.images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto p-2">
              {venue.images.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={venue.name} className="h-44 w-64 flex-none rounded-2xl object-cover" />
              ))}
            </div>
          ) : (
            <div
              className="flex h-40 items-end p-5"
              style={{ background: "radial-gradient(circle at 30% 20%, #3C7A1E 0%, #16170F 85%)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt={venue.name} className="h-8 w-auto opacity-90" />
            </div>
          )}
          <DialogHeader className="px-6 pb-2 pt-1 text-left">
            <DialogTitle className="text-2xl font-extrabold tracking-tight">{venue.name}</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-muted-foreground">
              {venue.description[lang]}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <Button asChild variant="brand" size="pill" className="w-full">
              <a href={venue.mapsUrl} target="_blank" rel="noopener noreferrer">
                {dict["location.directions"]}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
