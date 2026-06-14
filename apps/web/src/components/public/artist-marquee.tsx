import Link from "next/link";

interface A { id: string; slug: string; name: string; }

/** Slim scrolling artist ticker for the top navbar strip. Two identical copies
 *  scroll together and reset at -50% for a seamless loop. */
export function ArtistMarquee({ artists }: { artists: A[] }) {
  if (!artists || artists.length === 0) return null;
  const items = [...artists, ...artists]; // duplicate for seamless loop
  return (
    <div className="marquee-mask overflow-hidden border-b border-white/10" style={{ background: "#16170F" }}>
      <div className="marquee-track py-2">
        {items.map((a, i) => (
          <Link
            key={`${a.id}-${i}`}
            href={`/artists/${a.slug}`}
            className="mx-4 inline-flex items-center gap-3 text-sm font-bold uppercase tracking-[2px] text-white/80 hover:text-white"
          >
            {a.name}
            <span style={{ color: "#9FE870" }}>✦</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
