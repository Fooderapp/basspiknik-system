import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Ticket, Wine, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function HomePage() {
  // Logged-in users land directly in the consumer app (mobile-first shell).
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/home");

  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  const features = [
    { icon: Ticket,  tone: "is-green", title: t(dict, "home.feature_tickets_title"), desc: t(dict, "home.feature_tickets_desc") },
    { icon: ScanLine, tone: "is-sky",  title: t(dict, "home.feature_checkin_title"), desc: t(dict, "home.feature_checkin_desc") },
    { icon: Wine,    tone: "is-gold",  title: t(dict, "home.feature_bar_title"),     desc: t(dict, "home.feature_bar_desc") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Ticket className="h-6 w-6 text-primary" />
            EventOS
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild><Link href="/events">{t(dict, "nav.events")}</Link></Button>
            <Button variant="ghost" asChild><Link href="/menu">{t(dict, "nav.bar_menu")}</Link></Button>
            <Button variant="ghost" asChild><Link href="/my-tickets">{t(dict, "nav.my_tickets")}</Link></Button>
            <Button asChild><Link href="/sign-in">{t(dict, "nav.sign_in")}</Link></Button>
          </div>
        </div>
      </nav>

      <main className="container py-24 text-center space-y-7">
        <h1 className="headline-xl mx-auto max-w-3xl">
          {t(dict, "home.headline")}{" "}
          <span style={{ color: "#163300" }}>{t(dict, "home.headline_accent")}</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t(dict, "home.subline")}
        </p>
        <div className="flex justify-center gap-3">
          <Button size="lg" className="rounded-full px-7" asChild><Link href="/events">{t(dict, "home.browse_events")}</Link></Button>
          <Button size="lg" variant="outline" className="rounded-full px-7" asChild><Link href="/dashboard">{t(dict, "nav.dashboard")}</Link></Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto pt-12 text-left">
          {features.map(({ icon: Icon, tone, title, desc }) => (
            <div key={title} className={`pastel-card ${tone}`}>
              <span className="icon-circle mb-4">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-bold text-lg mb-1 tracking-tight">{title}</h3>
              <p className="text-sm opacity-70">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
