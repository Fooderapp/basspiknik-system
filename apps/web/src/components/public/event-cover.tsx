"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DESKTOP_HEIGHT = 300;

/** Full-bleed event cover. Mobile: plain 16:9 image. Desktop: a 300px-tall
 *  blurred full-width backdrop with the sharp 16:9 cover centered on top.
 *  Collapses from its natural height to 0 as the page starts scrolling.
 *  Height is written straight to the DOM (no setState, no CSS transition)
 *  so it tracks the scroll position 1:1 every frame without jitter. */
export function EventCover({ src }: { src: string | null | undefined }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cached images are already `complete` by the time React attaches the
  // onLoad handler, so `load` never fires — check on mount too.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, [src]);

  useLayoutEffect(() => {
    if (!src) return;
    const el = wrapRef.current;
    if (!el) return;

    let max = DESKTOP_HEIGHT;
    let ticking = false;

    const computeMax = () => {
      const isDesktop = window.innerWidth >= 640;
      max = isDesktop ? DESKTOP_HEIGHT : (el.offsetWidth * 9) / 16;
    };
    const apply = () => {
      el.style.height = `${Math.max(0, Math.round(max - window.scrollY))}px`;
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
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden"
      style={{ height: DESKTOP_HEIGHT, willChange: "height" }}
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
  );
}
