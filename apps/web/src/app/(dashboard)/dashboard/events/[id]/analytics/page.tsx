import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { formatCurrency, stripeFee } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, CreditCard, Ticket, Users, CheckSquare, ChevronLeft } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ONLINE_METHODS  = new Set(["ONLINE", "STRIPE"]);
function channelOf(m: string) {
  if (ONLINE_METHODS.has(m)) return "online";
  if (m === "CASH") return "cash";
  return "terminal";
}

export default async function EventAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient() as any;
  const settings = await getSettings();
  const dict = getDictionary(settings.language);
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  const [
    { data: eventRaw },
    { data: ordersRaw },
    { data: checkInsRaw },
  ] = await Promise.all([
    supabase.from("events").select("id, name, slug, ticket_types(id, name, quantity, sold, price)").eq("id", id).single(),
    supabase.from("orders")
      .select("id, total, payment_method, guest_name, guest_email, created_at, status, seller_id, profiles!orders_seller_id_fkey(name, email), order_items(quantity, total, ticket_types(name))")
      .eq("event_id", id)
      .in("status", ["PAID", "REFUNDED"])
      .order("created_at", { ascending: false }),
    supabase.from("check_ins").select("id").eq("event_id", id),
  ]);

  if (!eventRaw) notFound();

  const event = eventRaw as any;
  const allOrders = (ordersRaw ?? []) as any[];
  const paidOrders = allOrders.filter((o: any) => o.status === "PAID");
  const refundedTotal = allOrders.filter((o: any) => o.status === "REFUNDED").reduce((s: number, o: any) => s + o.total, 0);
  const checkInCount = (checkInsRaw ?? []).length;

  const gross = paidOrders.reduce((s: number, o: any) => s + o.total, 0);
  const fees = paidOrders.reduce((s: number, o: any) =>
    channelOf(o.payment_method) === "online" ? s + stripeFee(o.total) : s, 0);
  const payout = Math.round((gross - fees - refundedTotal) * 100) / 100;

  const totalSold = event.ticket_types.reduce((s: number, t: any) => s + t.sold, 0);
  const totalCapacity = event.ticket_types.reduce((s: number, t: any) => s + t.quantity, 0);

  // Per ticket type breakdown from orders
  const typeMap = new Map<string, { sold: number; revenue: number }>();
  for (const o of paidOrders) {
    for (const it of o.order_items ?? []) {
      const name = it.ticket_types?.name ?? "—";
      const e = typeMap.get(name) ?? { sold: 0, revenue: 0 };
      e.sold += it.quantity;
      e.revenue += it.total;
      typeMap.set(name, e);
    }
  }
  const byType = [...typeMap.entries()].map(([name, v]) => ({ name, ...v }));

  // Per seller breakdown — only cash/POS orders have seller_id
  const sellerMap = new Map<string, { sellerName: string; sold: number; revenue: number }>();
  for (const o of paidOrders) {
    if (!o.seller_id) continue;
    const name = (o.profiles as any)?.name || (o.profiles as any)?.email || o.seller_id.slice(0, 8);
    const e = sellerMap.get(o.seller_id) ?? { sellerName: name, sold: 0, revenue: 0 };
    for (const it of o.order_items ?? []) e.sold += it.quantity;
    e.revenue += o.total;
    sellerMap.set(o.seller_id, e);
  }
  const bySeller = [...sellerMap.values()].sort((a, b) => b.revenue - a.revenue);

  const kpis = [
    { label: dict["event_analytics.gross"],    value: fmt(gross),         icon: TrendingUp },
    { label: dict["event_analytics.fees"],     value: fmt(fees),          icon: CreditCard },
    { label: dict["event_analytics.payout"],   value: fmt(payout),        icon: DollarSign },
    { label: dict["event_analytics.orders"],   value: paidOrders.length.toString(), icon: Ticket },
    { label: dict["event_analytics.sold"],     value: `${totalSold} / ${totalCapacity}`, icon: Users },
    { label: dict["event_analytics.checkins"], value: checkInCount.toString(), icon: CheckSquare },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/events" className="hover:text-foreground transition-colors">Events</Link>
        <span>/</span>
        <Link href={`/dashboard/events/${id}`} className="hover:text-foreground transition-colors">{event.name}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Analytics</span>
      </div>

      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${id}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">{event.name} — {dict["event_analytics.title"]}</h1>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xl font-bold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Capacity bar */}
      {totalCapacity > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{dict["event_analytics.capacity"]}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm mb-2">
              <span>{totalSold} sold</span>
              <span className="text-muted-foreground">{totalCapacity} total · {Math.round(totalSold / totalCapacity * 100)}%</span>
            </div>
            <div className="h-3 rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(Math.round(totalSold / totalCapacity * 100), 100)}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* By ticket type */}
      {byType.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{dict["event_analytics.by_type"]}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="px-6 py-3 text-left font-medium">Type</th>
                  <th className="px-6 py-3 text-right font-medium">Sold</th>
                  <th className="px-6 py-3 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((r) => (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="px-6 py-3 font-medium">{r.name}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.sold}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums">{fmt(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* By seller */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{dict["event_analytics.by_seller"]}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {bySeller.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">{dict["event_analytics.no_sellers"]}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="px-6 py-3 text-left font-medium">{dict["event_analytics.seller_name"]}</th>
                  <th className="px-6 py-3 text-right font-medium">Sold</th>
                  <th className="px-6 py-3 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {bySeller.map((r) => (
                  <tr key={r.sellerName} className="border-b last:border-0">
                    <td className="px-6 py-3 font-medium">{r.sellerName}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{r.sold}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums">{fmt(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{dict["event_analytics.recent"]}</CardTitle></CardHeader>
        <CardContent>
          {paidOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{dict["event_analytics.no_orders"]}</p>
          ) : (
            <div className="space-y-2">
              {paidOrders.slice(0, 20).map((o: any) => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{o.guest_name ?? o.guest_email ?? "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {channelOf(o.payment_method)} · {new Date(o.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">{fmt(o.total)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
