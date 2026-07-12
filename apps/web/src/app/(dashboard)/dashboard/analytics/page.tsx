import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, stripeFee } from "@/lib/utils";
import { TrendingUp, DollarSign, CreditCard, Percent, Wine, Users, Receipt } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import type { Order } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type OrderWithEvent = Order & {
  events: { name: string } | null;
  order_items?: Array<{ quantity: number; total: number; ticket_types: { name: string } | null }>;
  seller?: { name: string } | null;
};

/** Payment method buckets */
const ONLINE_METHODS  = new Set(["ONLINE", "STRIPE"]);
const CASH_METHODS    = new Set(["CASH"]);
const TERMINAL_METHODS = new Set(["CARD_TERMINAL", "TAP_TO_PAY", "TERMINAL", "CARD"]);

function channelOf(method: string): "online" | "cash" | "terminal" | "other" {
  if (ONLINE_METHODS.has(method))   return "online";
  if (CASH_METHODS.has(method))     return "cash";
  if (TERMINAL_METHODS.has(method)) return "terminal";
  return "other";
}

const CHANNEL_LABELS: Record<string, string> = {
  online:   "Online (Stripe)",
  cash:     "POS — Cash",
  terminal: "POS — Card Terminal",
  other:    "Other",
};

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") redirect("/dashboard");

  const supabase = await createClient() as any;

  const [
    { data: paidRaw },
    { data: refundedRaw },
    { data: drinkOrdersRaw },
    { data: drinkItemsRaw },
    settings,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total, payment_method, guest_name, guest_email, created_at, status, seller_id, events(name), order_items(quantity, total, ticket_types(name)), seller:profiles!orders_seller_id_fkey(name)")
      .eq("status", "PAID")
      .order("created_at", { ascending: false }),
    supabase.from("orders").select("total").eq("status", "REFUNDED"),
    // Bar: all fulfilled drink orders
    supabase
      .from("drink_orders")
      .select("id, total, status, created_at, guest_name")
      .in("status", ["FULFILLED", "PENDING", "IN_PROGRESS"])
      .order("created_at", { ascending: false }),
    // Bar: item breakdown
    supabase
      .from("drink_order_items")
      .select("drink_order_id, quantity, unit_price, drinks(name)"),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  const paidOrders = (paidRaw as OrderWithEvent[] | null) ?? [];
  const refunds    = ((refundedRaw as Array<{ total: number }> | null) ?? []).reduce((s, o) => s + o.total, 0);

  const gross = paidOrders.reduce((s, o) => s + o.total, 0);

  // Per-charge Stripe fee — online card only
  const fees = paidOrders.reduce((s, o) => {
    if (o.total > 0 && channelOf(o.payment_method) === "online") return s + stripeFee(o.total);
    return s;
  }, 0);
  const payout = Math.round((gross - fees - refunds) * 100) / 100;

  // ── Channel breakdown: online vs POS cash vs POS terminal ──
  type ChannelData = { count: number; revenue: number };
  const byChannel = paidOrders.reduce((acc, o) => {
    const ch = channelOf(o.payment_method);
    const e = acc[ch] ?? { count: 0, revenue: 0 };
    e.count++;
    e.revenue += o.total;
    acc[ch] = e;
    return acc;
  }, {} as Record<string, ChannelData>);

  // ── POS seller breakdown ──
  const posOrders = paidOrders.filter((o) => channelOf(o.payment_method) !== "online");
  const bySeller = posOrders.reduce((acc, o) => {
    const name = (o.seller as any)?.name ?? o.guest_name ?? "Unknown";
    const e = acc[name] ?? { count: 0, revenue: 0, items: 0 };
    e.count++;
    e.revenue += o.total;
    e.items += (o.order_items ?? []).reduce((s: number, it: any) => s + it.quantity, 0);
    acc[name] = e;
    return acc;
  }, {} as Record<string, { count: number; revenue: number; items: number }>);

  // ── Bar analytics ──
  const drinkOrders = (drinkOrdersRaw as any[] | null) ?? [];
  const drinkItems  = (drinkItemsRaw  as any[] | null) ?? [];

  const barRevenue  = drinkOrders.reduce((s: number, o: any) => s + (o.total ?? 0), 0);
  const barCount    = drinkOrders.length;
  const barAvg      = barCount > 0 ? barRevenue / barCount : 0;

  // Top drinks by quantity
  const drinkQtyMap = new Map<string, { qty: number; revenue: number }>();
  for (const it of drinkItems) {
    const name = (it.drinks as any)?.name ?? "Unknown";
    const e = drinkQtyMap.get(name) ?? { qty: 0, revenue: 0 };
    e.qty += it.quantity;
    e.revenue += (it.unit_price ?? 0) * it.quantity;
    drinkQtyMap.set(name, e);
  }
  const topDrinks = [...drinkQtyMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  const summaryCards = [
    { title: t(dict, "analytics.gross"),   value: fmt(gross),   icon: TrendingUp, desc: t(dict, "analytics.gross_desc") },
    { title: t(dict, "analytics.fees"),    value: fmt(fees),    icon: CreditCard,  desc: t(dict, "analytics.fees_desc") },
    { title: t(dict, "analytics.payout"),  value: fmt(payout),  icon: DollarSign,  desc: t(dict, "analytics.payout_desc") },
    { title: t(dict, "analytics.refunds"), value: fmt(refunds), icon: Percent,      desc: t(dict, "analytics.refunds_desc") },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t(dict, "analytics.title")}</h1>
        <p className="text-muted-foreground">{t(dict, "analytics.subtitle")}</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Channel breakdown ── */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Channel</CardTitle>
          <p className="text-sm text-muted-foreground">Online vs POS (cash / card terminal)</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(["online", "cash", "terminal", "other"] as const)
              .filter((ch) => byChannel[ch])
              .map((ch) => {
                const d = byChannel[ch];
                const pct = gross > 0 ? Math.round((d.revenue / gross) * 100) : 0;
                const barColor = ch === "online" ? "#EBE05A" : ch === "cash" ? "#9FE870" : "#60a5fa";
                return (
                  <div key={ch} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{CHANNEL_LABELS[ch]}</span>
                      <span className="text-muted-foreground tabular-nums">{d.count} orders · {fmt(d.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* ── POS seller detail ── */}
      {Object.keys(bySeller).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              POS Sales by Seller
            </CardTitle>
            <p className="text-sm text-muted-foreground">Detailed breakdown of who sold how many tickets at the door</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-left font-medium">Seller</th>
                    <th className="py-2 text-right font-medium">Orders</th>
                    <th className="py-2 text-right font-medium">Tickets</th>
                    <th className="py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bySeller)
                    .sort(([, a], [, b]) => b.revenue - a.revenue)
                    .map(([name, d]) => (
                      <tr key={name} className="border-b last:border-0">
                        <td className="py-2 font-medium">{name}</td>
                        <td className="py-2 text-right tabular-nums">{d.count}</td>
                        <td className="py-2 text-right tabular-nums">{d.items}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{fmt(d.revenue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Bar analytics ── */}
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Wine className="h-5 w-5 text-muted-foreground" />
          Bar Analytics
        </h2>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          {[
            { title: "Total Bar Revenue", value: fmt(barRevenue), icon: DollarSign },
            { title: "Orders", value: barCount.toString(), icon: Receipt },
            { title: "Avg Order Value", value: fmt(barAvg), icon: TrendingUp },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {topDrinks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Drinks</CardTitle>
              <p className="text-sm text-muted-foreground">Most ordered items at the bar</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topDrinks.map((d, i) => {
                  const maxQty = topDrinks[0]?.qty ?? 1;
                  const pct = Math.round((d.qty / maxQty) * 100);
                  return (
                    <div key={d.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          <span className="text-muted-foreground mr-2 tabular-nums">#{i + 1}</span>
                          {d.name}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{d.qty}× · {fmt(d.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {drinkOrders.length > 0 && (
          <Card className="mt-4">
            <CardHeader><CardTitle>Recent Bar Orders</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {drinkOrders.slice(0, 10).map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{order.guest_name ?? "Guest"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{order.status.toLowerCase().replace("_", " ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{fmt(order.total ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Recent ticket orders ── */}
      <Card>
        <CardHeader><CardTitle>{t(dict, "analytics.recent")}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {paidOrders.slice(0, 10).map((order, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{order.guest_name ?? order.guest_email ?? t(dict, "analytics.registered")}</p>
                  <p className="text-xs text-muted-foreground">
                    {(order as any).events?.name}
                    {" · "}
                    <span className="capitalize">{CHANNEL_LABELS[channelOf(order.payment_method)] ?? order.payment_method}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{fmt(order.total)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
