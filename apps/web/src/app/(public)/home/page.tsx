import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Star, ShoppingBag, Wine, Sparkles, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketWallet, type WalletTicket } from "@/components/consumer/ticket-wallet";
import { TaskList } from "@/components/consumer/task-list";
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
      .select("id, status, ticket_name, tier, order_id, qr_code, created_at, orders!inner(user_id), events(name, venue, start_date, cover_image_url, banner_image_url), ticket_types(image_url)")
      .eq("orders.user_id", user.id)
      .in("status", ["VALID", "USED"]),
    supabase
      .from("tickets")
      .select("id, status, ticket_name, tier, order_id, qr_code, created_at, events(name, venue, start_date, cover_image_url, banner_image_url), ticket_types(image_url)")
      .eq("transferred_to_user_id", user.id)
      .in("status", ["VALID", "USED"]),
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
    const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bd - ad; // newest purchase first
  });
  const allWalletTickets: WalletTicket[] = sorted.map((tk: any) => {
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
  // If every ticket has been scanned (USED), show only the most recent one in the wallet
  const allUsed = allWalletTickets.length > 0 && allWalletTickets.every((t) => t.status === "USED");
  const walletTickets = allUsed ? [allWalletTickets[0]] : allWalletTickets;

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
      {/* Greeting + credit chip + bell — mirrors mobile home */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[34px] font-extrabold leading-tight tracking-tight" style={{ letterSpacing: "-1px" }}>
            Hi {firstName} 👋
          </h1>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Link href="/events" className="flex h-10 items-center gap-1.5 rounded-full bg-card px-3.5 shadow-sm">
            <Star className="h-3.5 w-3.5" strokeWidth={2.5} style={{ color: "#163300", fill: "#9FE870" }} />
            <span className="text-sm font-extrabold">{balanceNum}</span>
          </Link>
          <Link href="/scan" className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm">
            <ScanLine className="h-[18px] w-[18px]" strokeWidth={2} />
          </Link>
        </div>
      </div>

      {/* Ticket wallet */}
      {walletTickets.length === 0 ? (
        <div className="flex flex-col items-center rounded-[2.25rem] py-12 text-center" style={{ background: "#E5E5E5" }}>
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--pastel-green)", color: "var(--pastel-green-ink)" }}>
            <ShoppingBag className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="font-bold">{t(dict, "mytickets.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(dict, "dash.no_next_sub")}</p>
          <Button asChild variant="brand" className="mt-5 px-6"><Link href="/events">{t(dict, "dash.browse")}</Link></Button>
        </div>
      ) : (
        <TicketWallet
          tickets={walletTickets}
          showLabel={t(dict, "dash.show_entry")}
          validLabel={t(dict, "mytickets.status_valid")}
        />
      )}

      {/* Earn-credits tasks */}
      <TaskList dict={dict} />

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight">{t(dict, "dash.activity")}</h2>
          <div className="overflow-hidden rounded-[2.25rem]" style={{ background: "#E5E5E5" }}>
            {recent.map((a, i) => {
              const Icon = actIcon(a.kind);
              return (
                <div key={a.id} className="flex items-center gap-3 p-3.5" style={i > 0 ? { borderTop: "1px solid rgba(20,22,15,0.08)" } : undefined}>
                  <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.label}</p>
                    {a.sub && <p className="truncate text-xs text-muted-foreground">{a.sub}</p>}
                  </div>
                  {a.amount && (
                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: a.positive ? "#3E7B12" : "#14160F" }}>
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
