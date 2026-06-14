import Link from "next/link";
import { Music2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { SiteHeader } from "@/components/public/site-header";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Artists" };

export default async function ArtistsListPage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings, { data: artists }] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
    supabase.from("artists").select("*").eq("active", true).order("sort_order").order("name"),
  ]);
  const dict = getDictionary(settings.language);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader dict={dict} loggedIn={!!user} />
      <div className="h-16" style={{ background: "#16170F" }} />
      <div className="mx-auto w-full max-w-6xl px-5 py-12">
        <h1 className="mb-7 text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "artists.title")}</h1>
        {(!artists || artists.length === 0) ? (
          <p className="text-muted-foreground">{t(dict, "artists.none")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {artists.map((a: any) => (
              <Link key={a.id} href={`/artists/${a.slug}`} className="group">
                <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-muted shadow-sm">
                  {a.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photo_url} alt={a.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : <div className="flex h-full items-center justify-center" style={{ background: "var(--pastel-lavender)" }}><Music2 className="h-8 w-8" style={{ color: "#2E2350" }} /></div>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3">
                    <p className="font-bold text-white line-clamp-1">{a.name}</p>
                    {a.genre && <p className="text-xs text-white/70 line-clamp-1">{a.genre}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
