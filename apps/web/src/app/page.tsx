import Link from "next/link";
import { Instagram, Facebook, Music2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { SiteHeader } from "@/components/public/site-header";
import { CookieBanner } from "@/components/consumer/cookie-banner";
import { HeroTypewriter } from "@/components/public/hero-typewriter";
import { EventCarousel } from "@/components/public/event-carousel";
import { ArtistCarousel } from "@/components/public/artist-carousel";
import { StickyFadeTitle } from "@/components/public/sticky-fade-title";
import { VenueExperience } from "@/components/public/venue-experience";
import type { Venue } from "@/lib/venue";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function HomePage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings, { data: content }, { data: artists }, { data: events }, { data: gallery }, { data: venueRows }] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
    supabase.from("site_content").select("*").eq("id", "home").single(),
    supabase.from("artists").select("*").eq("active", true).order("sort_order").order("name"),
    supabase.from("events").select("*, ticket_types(quantity, sold, is_visible, sale_enabled, sale_price, price)").in("status", ["PUBLISHED", "PREORDER"]).order("start_date"),
    supabase.from("gallery_images").select("*").order("sort_order").limit(12),
    supabase.from("map_venues").select("*, events!map_venues_event_id_fkey(slug, name)").eq("active", true).order("sort_order"),
  ]);

  const dict = getDictionary(settings.language);
  const c = content ?? {};

  const venues: Venue[] = (venueRows ?? []).map((v: any) => ({
    name: v.name,
    lat: v.lat,
    lng: v.lng,
    mapsUrl: v.maps_url,
    images: v.images ?? [],
    description: { en: v.description_en, hu: v.description_hu },
    eventSlug: v.events?.slug ?? undefined,
    eventName: v.events?.name ?? undefined,
    pinSvg: v.pin_svg ?? undefined,
  }));
  const heroSubtitle = c.hero_subtitle || t(dict, "home.hero_subtitle");
  const ctaLabel = c.hero_cta_label || t(dict, "home.browse_events");
  const socials: Record<string, string> = c.socials ?? {};

  // An event is "Coming Soon" when it has no currently-purchasable ticket types.
  function ticketState(ev: any): { soon: boolean; from: number | null } {
    const types = (ev.ticket_types ?? []).filter((tt: any) => tt.is_visible !== false);
    const available = types.filter((tt: any) => tt.quantity - tt.sold > 0);
    if (available.length === 0) return { soon: true, from: null };
    const from = Math.min(...available.map((tt: any) => (tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price)));
    return { soon: false, from };
  }

  return (
    <div className="min-h-screen bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero-bg.png" alt="" className="fixed inset-0 z-0 h-screen w-screen object-cover" />

      <SiteHeader dict={dict} loggedIn={!!user} />
      <CookieBanner dict={dict} />

      {/* ── Hero ── */}
      <section className="relative z-0 flex h-screen flex-col items-center justify-center overflow-hidden px-5 py-24 text-center">
        <VenueExperience venues={venues.length > 0 ? venues : [{ name: "Tó-Part Panzió", lat: 47.3975366, lng: 16.535894, mapsUrl: "https://www.google.com/maps/place/T%C3%B3-Part+Panzi%C3%B3/@47.3975366,16.535894,17z", images: [], description: { en: "Bass Piknik venue", hu: "Bass Piknik helyszín" } }]} dict={dict} lang={settings.language as "en" | "hu"} />
        <div className="relative z-10">
          <p className="mb-3 text-sm font-bold uppercase tracking-[3px]" style={{ color: "#3C7A1E" }}>{heroSubtitle}</p>
          <div className="text-5xl font-extrabold uppercase leading-[0.98] tracking-tight sm:text-7xl" style={{ letterSpacing: "-0.03em", color: "#16170F" }}>
            <HeroTypewriter words={[t(dict, "home.hero_word_1"), t(dict, "home.hero_word_2"), t(dict, "home.hero_word_3")]} />
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="brand" size="pill"><Link href="#events">{ctaLabel}</Link></Button>
            <Button asChild variant="brandOutline" size="pill"><Link href="#lineup">{t(dict, "nav.artists")}</Link></Button>
          </div>
          {(socials.instagram || socials.facebook) && (
            <div className="mt-4 flex justify-center gap-3">
              {socials.instagram && (
                <a href={socials.instagram} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80" style={{ background: "rgba(22,23,15,0.78)" }}>
                  <Instagram className="h-4 w-4" />Instagram
                </a>
              )}
              {socials.facebook && (
                <a href={socials.facebook} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80" style={{ background: "rgba(22,23,15,0.78)" }}>
                  <Facebook className="h-4 w-4" />Facebook
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Events ── */}
      <div id="events" className="scroll-mt-20" />
      <section className="relative z-[1] flex min-h-screen flex-col justify-center px-5 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <StickyFadeTitle className="sticky top-24 z-0 mb-7 py-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "nav.events")}</StickyFadeTitle>
          <div className="relative z-10">
          {(!events || events.length === 0) ? (
            <p className="text-muted-foreground">{t(dict, "events.none")}</p>
          ) : (
            <EventCarousel
              dict={dict}
              events={events.map((ev: any) => ({
                id: ev.id,
                slug: ev.slug,
                name: ev.name,
                start_date: ev.start_date,
                cover_image_url: ev.cover_image_url,
                home_cover_image_url: ev.home_cover_image_url,
                soon: ticketState(ev).soon,
              }))}
            />
          )}
          </div>
        </div>
      </section>

      {/* ── Who We Are ── */}
      <section className="relative z-[1] flex min-h-screen flex-col justify-center px-5 py-24">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-[2.25rem] bg-white px-8 py-10 shadow-sm">
            <StickyFadeTitle
              className="sticky top-24 z-0 py-2 text-center text-5xl font-extrabold uppercase tracking-tight sm:text-7xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              {t(dict, "who.title")}
            </StickyFadeTitle>
            <div className="relative z-10 mt-10">
              <p className="mb-5 text-base font-bold leading-relaxed" style={{ color: "#16170F" }}>
                {t(dict, "who.greeting")}
              </p>
              <p className="whitespace-pre-line text-base font-medium leading-relaxed text-muted-foreground">
                {t(dict, "who.body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Lineup / Artists ── */}
      {artists && artists.length > 0 && (
        <>
        <div id="lineup" className="scroll-mt-20" />
        <section className="relative z-[1] flex min-h-screen flex-col justify-center px-5 py-8">
          <div className="mx-auto w-full max-w-6xl">
            <StickyFadeTitle className="sticky top-24 z-0 mb-7 py-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "home.lineup")}</StickyFadeTitle>
            <div className="relative z-10">
            <ArtistCarousel
              dict={dict}
              artists={artists.map((a: any) => ({ id: a.id, slug: a.slug, name: a.name, genre: a.genre, photo_url: a.photo_url }))}
            />
            </div>
          </div>
        </section>
        </>
      )}

      {/* ── About ── */}
      {(c.about_title || c.about_body) && (
        <>
        <div id="about" className="scroll-mt-20" />
        <section className="relative z-[1] flex min-h-screen flex-col justify-center px-5 py-8 text-center">
          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-[2.25rem] bg-white px-8 py-10 shadow-sm">
              {c.about_title && <StickyFadeTitle className="sticky top-24 z-0 py-2 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{c.about_title}</StickyFadeTitle>}
              {c.about_body && <p className="relative z-10 mx-auto mt-4 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{c.about_body}</p>}
            </div>
          </div>
        </section>
        </>
      )}

      {/* ── Gallery ── */}
      {gallery && gallery.length > 0 && (
        <section className="relative z-[1] flex min-h-screen flex-col justify-center px-5 py-8">
          <div className="mx-auto w-full max-w-6xl">
            <StickyFadeTitle className="sticky top-24 z-0 mb-7 py-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "home.gallery")}</StickyFadeTitle>
            <div className="relative z-10 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {gallery.map((g: any) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={g.id} src={g.image_url} alt={g.caption ?? ""} className="aspect-square w-full rounded-2xl object-cover shadow-sm" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="relative z-[1]" style={{ background: "#16170F" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 py-12 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Bass Piknik" className="h-10 w-auto" />
          <div className="flex gap-3">
            {socials.instagram && <a href={socials.instagram} target="_blank" rel="noopener" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"><Instagram className="h-5 w-5" /></a>}
            {socials.facebook && <a href={socials.facebook} target="_blank" rel="noopener" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"><Facebook className="h-5 w-5" /></a>}
            {socials.soundcloud && <a href={socials.soundcloud} target="_blank" rel="noopener" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"><Music2 className="h-5 w-5" /></a>}
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-white/60">
            <Link href="/events">{t(dict, "nav.events")}</Link>
            <Link href="/menu">{t(dict, "nav.bar_menu")}</Link>
            <Link href="/my-tickets">{t(dict, "nav.my_tickets")}</Link>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/30">
            <Link href="/adatvedelem" className="hover:text-white/60 transition-colors">{t(dict, "footer.privacy")}</Link>
            <Link href="/aszf" className="hover:text-white/60 transition-colors">{t(dict, "footer.aszf")}</Link>
            <Link href="/impresszum" className="hover:text-white/60 transition-colors">{t(dict, "footer.impresszum")}</Link>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} Bass Piknik</p>
        </div>
      </footer>
    </div>
  );
}
