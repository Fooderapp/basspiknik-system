"use client";

import { useEffect, useRef, useState } from "react";

const DESKTOP_HEIGHT = 300;

/** Full-bleed event cover. Mobile: plain 16:9 image. Desktop: a 300px-tall
 *  blurred full-width backdrop with the sharp 16:9 cover centered on top.
 *  Collapses from its natural height to 0 as the page starts scrolling. */
export function EventCover({ src }: { src: string | null | undefined }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DESKTOP_HEIGHT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!src) return;
    let max = DESKTOP_HEIGHT;
    const computeMax = () => {
      const isDesktop = window.innerWidth >= 640;
      max = isDesktop ? DESKTOP_HEIGHT : ((wrapRef.current?.offsetWidth ?? window.innerWidth) * 9) / 16;
    };
    const onScroll = () => setHeight(Math.max(0, max - window.scrollY));
    const onResize = () => { computeMax(); onScroll(); };
    computeMax();
    onScroll();
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
      className="relative w-full overflow-hidden transition-[height] duration-150 ease-out"
      style={{ height }}
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
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 sm:aspect-video sm:h-[300px] sm:w-auto sm:max-w-full sm:rounded-3xl sm:shadow-2xl ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
