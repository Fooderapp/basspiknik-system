"use client";

import { useEffect, useRef, useState } from "react";
import { imgUrl, IMG } from "@/lib/image";

/** Event cover image in a rounded card, matching the app's card radius. */
export function EventCover({ src }: { src: string | null | undefined }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cached images are already `complete` by the time React attaches the
  // onLoad handler, so `load` never fires — check on mount too.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, [src]);

  if (!src) return null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[2.25rem] bg-muted">
      {!loaded && <div className="shimmer absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imgUrl(src, IMG.banner)}
        alt=""
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
