import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Ticket as TicketIcon, Star, ShoppingBag, Wine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketWallet, type WalletTicket } from "@/components/consumer/ticket-wallet";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Home" };

interface Activity {
  id: string;
  kind: "buy" | "won" | "bar" | "credit";
  label: string;
  sub: string | null;
  amount: string | null;
  positive: boolean;
  at: number;
}

export default async function HomePage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
  ]);
  if (!user) redirect("/sign-in?redirectTo=/home");

  const dict = getDictionary(settings.language);
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  const [
    { data: prof },
    { data: balance },
    { data: owned },
    { data: transferred },
    { data: orders },
    { data: drinks },
    { data: credits },
  ] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).single(),
    supabase.rpc("get_credit_balance", { p_user_id: user.id }),
    supabase
      .from("tickets")
      .select("id, status, ticket_name, tier, order_id, qr_code, orders!inner(user_id), events(name, venue, start_date, cover_image_url, banner_image_url), ticket_types(image_url)")
      .eq("orders.user_id", user.id)
      .eq("status", "VALID"),
    supabase
      .from("tickets")
      .select("id, status, ticket_name, tier, order_id, qr_code, events(name, venue, start_date, cover_image_url, banner_image_url), ticket_types(image_url)")
      .eq("transferred_to_user_id", user.id)
      .eq("status", "VALID"),
    supabase
      .from("orders")
      .select("id, total, created_at, status, events(name)")
      .eq("user_id", user.id)
      .eq("status", "PAID")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("drink_orders")
      .select("id, total, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("credit_transactions")
      .select("id, amount, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // ── Build wallet tickets (with 1-of-N per order) ──
  const seen = new Set<string>();
  const rawTickets = [...(owned ?? []), ...(transferred ?? [])].filter((tk: any) =>
    seen.has(tk.id) ? false : (seen.add(tk.id), true),
  );
  const orderCounts = new Map<string, number>();
  for (const tk of rawTickets) orderCounts.set(tk.order_id, (orderCounts.get(tk.order_id) ?? 0) + 1);
  const orderSeen = new Map<string, number>();
  const sorted = [...rawTickets].sort((a: any, b: any) => {
    const ad = a.events?.start_date ? new Date(a.events.start_date).getTime() : Infinity;
    const bd = b.events?.start_date ? new Date(b.events.start_date).getTime() : Infinity;
    return ad - bd;
  });
  const walletTickets: WalletTicket[] = sorted.map((tk: any) => {
    const idx = (orderSeen.get(tk.order_id) ?? 0) + 1;
    orderSeen.set(tk.order_id, idx);
    return {
      id: tk.id,
      eventName: tk.events?.name ?? tk.ticket_name ?? "Ticket",
      date: tk.events?.start_date ? formatDate(tk.events.start_date) : null,
      venue: tk.events?.venue ?? null,
      cover: tk.events?.cover_image_url ?? null,
      // Ticket-type image wins over event banner, then cover.
      banner: tk.ticket_types?.image_url ?? tk.events?.banner_image_url ?? null,
      qrCode: tk.qr_code,
      ticketName: tk.ticket_name ?? "Ticket",
      tier: tk.tier ?? null,
      status: tk.status,
      index: idx,
      count: orderCounts.get(tk.order_id) ?? 1,
    };
  });

  // ── Merge recent activity ──
  const acts: Activity[] = [];
  for (const o of orders ?? []) {
    const free = (o.total ?? 0) <= 0;
    acts.push({
      id: `o-${o.id}`,
      kind: free ? "won" : "buy",
      label: free ? t(dict, "act.won") : t(dict, "act.bought"),
      sub: o.events?.name ?? null,
      amount: free ? null : fmt(o.total),
      positive: false,
      at: new Date(o.created_at).getTime(),
    });
  }
  for (const d of drinks ?? []) {
    acts.push({
      id: `d-${d.id}`, kind: "bar", label: t(dict, "act.bar"), sub: null,
      amount: d.total ? fmt(d.total) : null, positive: false,
      at: new Date(d.created_at).getTime(),
    });
  }
  for (const c of credits ?? []) {
    const pos = c.amount >= 0;
    acts.push({
      id: `c-${c.id}`, kind: "credit",
      label: pos ? t(dict, "act.credit_earn") : t(dict, "act.credit_spend"),
      sub: null,
      amount: `${pos ? "+" : ""}${c.amount} ${t(dict, "act.credits")}`,
      positive: pos,
      at: new Date(c.created_at).getTime(),
    });
  }
  acts.sort((a, b) => b.at - a.at);
  const recent = acts.slice(0, 5);

  const balanceNum = typeof balance === "number" ? balance : 0;
  const firstName = (prof?.name ?? user.email ?? "").split(/[ @]/)[0];

  const actIcon = (k: Activity["kind"]) =>
    k === "bar" ? Wine : k === "credit" ? Sparkles : k === "won" ? Star : ShoppingBag;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:py-10">
      {/* Greeting + credit chip */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t(dict, "dash.greeting")}</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{firstName}</h1>
        </div>
        <Link href="/events" className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5">
          <Star className="h-3.5 w-3.5 fill-gold text-gold" strokeWidth={2} />
          <span className="text-sm font-semibold text-gold">{balanceNum}</span>
          <span className="text-xs text-gold/70">{t(dict, "profile.credits")}</span>
        </Link>
      </div>

      {/* Ticket wallet */}
      {walletTickets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center">
          <TicketIcon className="mb-3 h-9 w-9 text-muted-foreground/40" />
          <p className="font-semibold">{t(dict, "mytickets.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(dict, "dash.no_next_sub")}</p>
          <Button asChild className="mt-5"><Link href="/events">{t(dict, "dash.browse")}</Link></Button>
        </div>
      ) : (
        <TicketWallet
          tickets={walletTickets}
          showLabel={t(dict, "dash.show_entry")}
          validLabel={t(dict, "mytickets.status_valid")}
        />
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-bold tracking-tight">{t(dict, "dash.activity")}</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {recent.map((a, i) => {
              const Icon = actIcon(a.kind);
              return (
                <div key={a.id} className={`flex items-center gap-3 p-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.label}</p>
                    {a.sub && <p className="truncate text-xs text-muted-foreground">{a.sub}</p>}
                  </div>
                  {a.amount && (
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${a.positive ? "text-brand" : ""}`}>
                      {a.amount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
