"use client";

import { useEffect, useRef, type CSSProperties } from "react";

const FADE_RANGE = 160;

/** Sticky section title that fades out as its section's bottom edge
 *  approaches, just before the next section carries it away. */
export function StickyFadeTitle({ children, className, style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    const section = el?.closest("section");
    if (!el || !section) return;

    function onScroll() {
      const top = parseFloat(getComputedStyle(el!).top) || 0;
      const rect = section!.getBoundingClientRect();
      const distance = rect.bottom - (top + el!.offsetHeight);
      el!.style.opacity = String(Math.max(0, Math.min(1, distance / FADE_RANGE)));
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <h2 ref={ref} className={className} style={{ ...style, transition: "opacity 0.1s linear" }}>
      {children}
    </h2>
  );
}
