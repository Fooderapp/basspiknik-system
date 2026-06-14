import Link from "next/link";
import { CalendarDays, MapPin, Instagram, Facebook, Music2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { formatDate, formatCurrency } from "@/lib/utils";
import { SiteHeader } from "@/components/public/site-header";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function HomePage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings, { data: content }, { data: artists }, { data: events }, { data: gallery }] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
    supabase.from("site_content").select("*").eq("id", "home").single(),
    supabase.from("artists").select("*").eq("active", true).order("sort_order").order("name"),
    supabase.from("events").select("*, ticket_types(quantity, sold, is_visible, sale_enabled, sale_price, price)").eq("status", "PUBLISHED").order("start_date"),
    supabase.from("gallery_images").select("*").order("sort_order").limit(12),
  ]);

  const dict = getDictionary(settings.language);
  const c = content ?? {};
  const heroTitle = c.hero_title || "Bass Piknik";
  const heroSubtitle = c.hero_subtitle || "Open-air electronic music";
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
    <div className="min-h-screen bg-background">
      <SiteHeader dict={dict} loggedIn={!!user} />

      {/* ── Hero ── */}
      <section className="relative flex min-h-[78vh] items-end overflow-hidden">
        {c.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.hero_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#163300,#2C3A18 60%,#16170F)" }} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(15,16,10,0.92), rgba(15,16,10,0.25) 55%, rgba(15,16,10,0.45))" }} />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-16">
          <p className="mb-3 text-sm font-bold uppercase tracking-[3px]" style={{ color: "#9FE870" }}>{heroSubtitle}</p>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[0.98] tracking-tight text-white sm:text-7xl" style={{ letterSpacing: "-0.03em" }}>
            {heroTitle}
          </h1>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/events" className="rounded-full px-7 py-3.5 font-bold" style={{ background: "#9FE870", color: "#0a1305" }}>{ctaLabel}</Link>
            <Link href="#lineup" className="rounded-full border border-white/30 px-7 py-3.5 font-bold text-white backdrop-blur-sm">{t(dict, "nav.artists")}</Link>
          </div>
        </div>
      </section>

      {/* ── Events ── */}
      <section id="events" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="mb-7 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "nav.events")}</h2>
        {(!events || events.length === 0) ? (
          <p className="text-muted-foreground">{t(dict, "events.none")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev: any) => {
              const st = ticketState(ev);
              const card = (
                <div className="group overflow-hidden rounded-3xl bg-card shadow-sm transition-transform hover:-translate-y-0.5">
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    {ev.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ev.cover_image_url} alt={ev.name} className="h-full w-full object-cover" />
                    ) : <div className="h-full w-full" style={{ background: "var(--pastel-green)" }} />}
                    {st.soon && (
                      <span className="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: "#16170F", color: "#fff" }}>
                        {t(dict, "home.coming_soon")}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-bold tracking-tight line-clamp-1">{ev.name}</h3>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />{formatDate(ev.start_date)}
                    </div>
                    {ev.venue && <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /><span className="line-clamp-1">{ev.venue}</span></div>}
                    <div className="mt-3 text-sm font-semibold" style={{ color: "#163300" }}>
                      {st.soon ? t(dict, "home.coming_soon") : `${t(dict, "events.from")} ${formatCurrency(st.from!, settings.currency)}`}
                    </div>
                  </div>
                </div>
              );
              return st.soon
                ? <div key={ev.id}>{card}</div>
                : <Link key={ev.id} href={`/events/${ev.slug}`}>{card}</Link>;
            })}
          </div>
        )}
      </section>

      {/* ── Lineup / Artists ── */}
      {artists && artists.length > 0 && (
        <section id="lineup" className="mx-auto w-full max-w-6xl px-5 py-16">
          <h2 className="mb-7 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "home.lineup")}</h2>
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
        </section>
      )}

      {/* ── About ── */}
      {(c.about_title || c.about_body) && (
        <section className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
          {c.about_title && <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{c.about_title}</h2>}
          {c.about_body && <p className="mx-auto mt-4 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{c.about_body}</p>}
        </section>
      )}

      {/* ── Gallery ── */}
      {gallery && gallery.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <h2 className="mb-7 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>{t(dict, "home.gallery")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {gallery.map((g: any) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={g.id} src={g.image_url} alt={g.caption ?? ""} className="aspect-square w-full rounded-2xl object-cover shadow-sm" />
            ))}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t" style={{ background: "#16170F" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 py-12 text-center">
          <p className="text-2xl font-extrabold text-white tracking-tight">Bass Piknik</p>
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
          <p className="text-xs text-white/40">© {new Date().getFullYear()} Bass Piknik</p>
        </div>
      </footer>
    </div>
  );
}
