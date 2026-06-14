import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Instagram, Facebook, Music2, Globe, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { SiteHeader } from "@/components/public/site-header";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient() as any;
  const { data } = await supabase.from("artists").select("name").eq("slug", slug).single();
  return { title: data?.name ?? "Artist" };
}

const SOCIAL_ICON: Record<string, any> = {
  instagram: Instagram, facebook: Facebook, soundcloud: Music2, spotify: Play, website: Globe,
};

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings, { data: artist }] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
    supabase.from("artists").select("*").eq("slug", slug).eq("active", true).single(),
  ]);
  if (!artist) notFound();
  const dict = getDictionary(settings.language);
  const socials: Record<string, string> = artist.socials ?? {};

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader dict={dict} loggedIn={!!user} />

      {/* Hero band */}
      <section className="relative flex min-h-[60vh] items-end overflow-hidden">
        {artist.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artist.photo_url} alt={artist.name} className="absolute inset-0 h-full w-full object-cover" />
        ) : <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#2E2350,#16170F)" }} />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(15,16,10,0.92), rgba(15,16,10,0.2) 60%)" }} />
        <div className="relative mx-auto w-full max-w-4xl px-5 pb-12">
          {artist.genre && <p className="mb-2 text-sm font-bold uppercase tracking-[3px]" style={{ color: "#9FE870" }}>{artist.genre}</p>}
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-7xl" style={{ letterSpacing: "-0.03em" }}>{artist.name}</h1>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-5 py-12">
        <Link href="/artists" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{t(dict, "artist.back")}
        </Link>

        {artist.bio && <p className="mt-6 whitespace-pre-line text-lg leading-relaxed">{artist.bio}</p>}

        {Object.values(socials).some(Boolean) && (
          <div className="mt-8 flex flex-wrap gap-2">
            {Object.entries(socials).filter(([, v]) => v).map(([k, v]) => {
              const Icon = SOCIAL_ICON[k] ?? Globe;
              return (
                <a key={k} href={v} target="_blank" rel="noopener"
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold capitalize"
                  style={{ background: "#16170F", color: "#fff" }}>
                  <Icon className="h-4 w-4" />{k}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
