import Link from "next/link";
import { Music2 } from "lucide-react";

interface A { id: string; slug: string; name: string; genre?: string | null; photo_url?: string | null }

/** Dark top-of-page strip — horizontal scrolling carousel of artist photo
 *  cards, sitting just below the floating capsule nav. */
export function ArtistCarousel({ artists }: { artists: A[] }) {
  if (!artists || artists.length === 0) return null;
  return (
    <div style={{ background: "#16170F" }}>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-6 pt-28">
        {artists.map((a) => (
          <Link
            key={a.id}
            href={`/artists/${a.slug}`}
            className="group relative aspect-[3/4] w-[150px] shrink-0 snap-start overflow-hidden rounded-3xl bg-white/5 sm:w-[190px]"
          >
            {a.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photo_url} alt={a.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <div className="flex h-full items-center justify-center" style={{ background: "var(--pastel-lavender)" }}>
                <Music2 className="h-8 w-8" style={{ color: "#2E2350" }} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="font-bold text-white line-clamp-1">{a.name}</p>
              {a.genre && <p className="text-xs text-white/70 line-clamp-1">{a.genre}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
