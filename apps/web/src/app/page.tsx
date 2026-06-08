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
    { icon: Ticket,  title: t(dict, "home.feature_tickets_title"), desc: t(dict, "home.feature_tickets_desc") },
    { icon: ScanLine, title: t(dict, "home.feature_checkin_title"), desc: t(dict, "home.feature_checkin_desc") },
    { icon: Wine,    title: t(dict, "home.feature_bar_title"),     desc: t(dict, "home.feature_bar_desc") },
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

      <main className="container py-24 text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          {t(dict, "home.headline")}
          <br />
          <span className="text-primary">{t(dict, "home.headline_accent")}</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t(dict, "home.subline")}
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" asChild><Link href="/events">{t(dict, "home.browse_events")}</Link></Button>
          <Button size="lg" variant="outline" asChild><Link href="/dashboard">{t(dict, "nav.dashboard")}</Link></Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto pt-12 text-left">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <Icon className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
