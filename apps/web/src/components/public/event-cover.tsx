"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DESKTOP_HEIGHT = 300;

/** Full-bleed event cover. Mobile: plain 16:9 image. Desktop: a 300px-tall
 *  blurred full-width backdrop with the sharp 16:9 cover centered on top.
 *
 *  The cover sits in `position: fixed` behind the page; a spacer of the same
 *  (static) height reserves its space in the flow. Scrolling translates the
 *  cover up via `transform`, which is compositor-only — no layout/height
 *  changes happen during scroll, so there's no reflow and nothing for scroll
 *  anchoring to fight, eliminating jitter. */
export function EventCover({ src }: { src: string | null | undefined }) {
  const coverRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cached images are already `complete` by the time React attaches the
  // onLoad handler, so `load` never fires — check on mount too.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, [src]);

  useLayoutEffect(() => {
    if (!src) return;
    const cover = coverRef.current;
    const spacer = spacerRef.current;
    if (!cover || !spacer) return;

    let max = DESKTOP_HEIGHT;
    let ticking = false;

    const computeMax = () => {
      const isDesktop = window.innerWidth >= 640;
      max = isDesktop ? DESKTOP_HEIGHT : (cover.offsetWidth * 9) / 16;
      cover.style.height = `${max}px`;
      spacer.style.height = `${max}px`;
    };
    const apply = () => {
      const y = Math.min(Math.max(0, window.scrollY), max);
      cover.style.transform = `translateY(${-y}px)`;
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    const onResize = () => { computeMax(); apply(); };

    computeMax();
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [src]);

  if (!src) return null;

  return (
    <>
      {/* Reserves the cover's height in the document flow */}
      <div ref={spacerRef} style={{ height: DESKTOP_HEIGHT }} aria-hidden />

      <div
        ref={coverRef}
        className="fixed inset-x-0 top-0 w-full overflow-hidden"
        style={{ height: DESKTOP_HEIGHT, willChange: "transform" }}
      >
        {/* Desktop: full-width blurred backdrop */}
        <div
          className="absolute inset-0 hidden scale-110 sm:block"
          style={{ backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) brightness(0.55)" }}
        />

        {/* Loading shimmer */}
        {!loaded && <div className="shimmer absolute inset-0" />}

        {/* Sharp cover, centered on desktop, full-bleed on mobile */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-opacity duration-500 sm:aspect-video sm:h-[300px] sm:w-auto sm:max-w-full sm:rounded-3xl sm:shadow-2xl ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      </div>
    </>
  );
}
