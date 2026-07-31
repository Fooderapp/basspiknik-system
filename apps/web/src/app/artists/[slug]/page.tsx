import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Instagram, Facebook, Music2, Globe, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { SiteHeader } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";
import { EventCarousel } from "@/components/public/event-carousel";
import { formatDate } from "@/lib/utils";
import { imgUrl, IMG } from "@/lib/image";

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
  const eventIds: string[] = artist.event_ids ?? [];

  // fetch future events linked to this artist (with cover + ticket types for card)
  let linkedEvents: any[] = [];
  if (eventIds.length > 0) {
    const now = new Date().toISOString();
    const { data: evData } = await supabase
      .from("events")
      .select("id, name, slug, start_date, cover_image_url, home_cover_image_url, ticket_types(quantity, sold, is_visible, sale_enabled, sale_price, price)")
      .in("id", eventIds)
      .gte("start_date", now)
      .order("start_date");
    linkedEvents = evData ?? [];
  }

  function ticketState(ev: any): { soon: boolean } {
    const types = (ev.ticket_types ?? []).filter((tt: any) => tt.is_visible !== false);
    const available = types.filter((tt: any) => tt.quantity - tt.sold > 0);
    return { soon: available.length === 0 };
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader dict={dict} loggedIn={!!user} />

      <div className="mx-auto w-full max-w-3xl px-5 py-12 pt-28">
        <Link href="/#lineup" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{t(dict, "artist.back")}
        </Link>

        <div className="relative mx-auto mt-6 aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2.5rem] bg-muted shadow-sm">
          {artist.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl(artist.photo_url, IMG.banner)} alt={artist.name} className="h-full w-full object-cover" />
          ) : <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#2E2350,#16170F)" }} />}
        </div>

        <div className="mt-6 text-center">
          {artist.genre && <p className="mb-2 text-sm font-bold uppercase tracking-[3px]" style={{ color: "#3C7A1E" }}>{artist.genre}</p>}
          <h1 className="text-4xl font-extrabold uppercase tracking-tight sm:text-6xl" style={{ letterSpacing: "-0.03em", color: "#16170F" }}>{artist.name}</h1>
        </div>

        {Object.values(socials).some(Boolean) && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {Object.entries(socials).filter(([, v]) => v).map(([k, v]) => {
              const Icon = SOCIAL_ICON[k] ?? Globe;
              return (
                <Button key={k} asChild variant="brand" className="capitalize">
                  <a href={v} target="_blank" rel="noopener"><Icon className="h-4 w-4" />{k}</a>
                </Button>
              );
            })}
          </div>
        )}

        {artist.bio && <p className="mt-6 whitespace-pre-line text-lg leading-relaxed">{artist.bio}</p>}
      </div>

      {linkedEvents.length > 0 && (
        <section className="mx-auto w-full max-w-3xl px-5 pb-20 pt-4">
          <h2 className="mb-6 text-center text-2xl font-extrabold uppercase tracking-tight" style={{ letterSpacing: "-0.03em", color: "#16170F" }}>
            {t(dict, "artist.upcoming_event")}
          </h2>
          <EventCarousel
            dict={dict}
            events={linkedEvents.map((ev) => ({
              id: ev.id,
              slug: ev.slug,
              name: ev.name,
              start_date: ev.start_date,
              cover_image_url: ev.cover_image_url,
              home_cover_image_url: ev.home_cover_image_url,
              soon: ticketState(ev).soon,
            }))}
          />
        </section>
      )}
    </div>
  );
}
