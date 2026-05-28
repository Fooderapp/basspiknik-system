import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Ticket, Wine, ScanLine } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Ticket className="h-6 w-6 text-primary" />
            EventOS
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild><Link href="/events">Events</Link></Button>
            <Button variant="ghost" asChild><Link href="/menu">Bar Menu</Link></Button>
            <Button asChild><Link href="/sign-in">Sign In</Link></Button>
          </div>
        </div>
      </nav>

      <main className="container py-24 text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Events. Tickets. Bar.
          <br />
          <span className="text-primary">All in one place.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Sell tickets online and in-person, manage check-ins with QR codes,
          and run your bar with real-time ordering — built for event series.
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" asChild><Link href="/events">Browse Events</Link></Button>
          <Button size="lg" variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto pt-12 text-left">
          {[
            { icon: Ticket, title: "Ticket Sales", desc: "Online, in-person, and embedded on any website. Apple & Google Wallet included." },
            { icon: ScanLine, title: "QR Check-In", desc: "Fast scanning with green/red feedback. Offline mode with sync. Works on any device." },
            { icon: Wine, title: "Bar Ordering", desc: "Digital drink menu, cart, QR orders, and a real-time bartender app with VIP alerts." },
          ].map(({ icon: Icon, title, desc }) => (
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
