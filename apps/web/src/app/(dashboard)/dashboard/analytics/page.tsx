import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, stripeFee } from "@/lib/utils";
import { TrendingUp, DollarSign, CreditCard, Percent } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { TicketTypeChart, type TicketTypeDatum } from "@/components/dashboard/ticket-type-chart";
import type { Order, Event } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type OrderWithEvent = Order & {
  events: { name: string } | null;
  order_items?: Array<{ quantity: number; total: number; ticket_types: { name: string } | null }>;
};
type EventWithRelations = Event & {
  ticket_types: Array<{ quantity: number; sold: number }>;
  check_ins: Array<unknown>;
};

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") redirect("/dashboard");

  const supabase = await createClient() as any;

  const [
    { data: paidRaw },
    { data: refundedRaw },
    { data: eventsRaw },
    settings,
  ] = await Promise.all([
    supabase.from("orders").select("total, payment_method, guest_name, guest_email, created_at, events(name), order_items(quantity, total, ticket_types(name))").eq("status", "PAID").order("created_at", { ascending: false }),
    supabase.from("orders").select("total").eq("status", "REFUNDED"),
    supabase.from("events").select("id, name, ticket_types(quantity, sold), check_ins(id)").eq("status", "PUBLISHED"),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  const paidOrders = (paidRaw as OrderWithEvent[] | null) ?? [];
  const refunds    = ((refundedRaw as Array<{ total: number }> | null) ?? []).reduce((s, o) => s + o.total, 0);
  const events     = (eventsRaw as EventWithRelations[] | null) ?? [];

  const gross = paidOrders.reduce((s, o) => s + o.total, 0);

  // Per-charge Stripe fee on real card payments only (cash + free excluded).
  const fees = paidOrders.reduce((s, o) => {
    if (o.total > 0 && o.payment_method !== "CASH") return s + stripeFee(o.total);
    return s;
  }, 0);
  const payout = Math.round((gross - fees - refunds) * 100) / 100;

  const byChannel = paidOrders.reduce((acc, o) => {
    acc[o.payment_method] = (acc[o.payment_method] ?? 0) + o.total;
    return acc;
  }, {} as Record<string, number>);

  // Ticket-type breakdown: paid qty + revenue vs free (spin-won) qty.
  // Free orders are zero-total; their tickets are still counted by type.
  const typeMap = new Map<string, { paid: number; free: number; revenue: number }>();
  for (const o of paidOrders) {
    const isFree = (o.total ?? 0) <= 0;
    for (const it of o.order_items ?? []) {
      const name = it.ticket_types?.name ?? "—";
      const e = typeMap.get(name) ?? { paid: 0, free: 0, revenue: 0 };
      if (isFree) e.free += it.quantity;
      else { e.paid += it.quantity; e.revenue += it.total; }
      typeMap.set(name, e);
    }
  }
  const byType = [...typeMap.entries()].map(([name, v]) => ({ name, ...v }));
  const chartData: TicketTypeDatum[] = byType.map((r) => ({ name: r.name, paid: r.paid, free: r.free }));

  const cards = [
    { title: t(dict, "analytics.gross"),   value: fmt(gross),   icon: TrendingUp, color: "text-muted-foreground",  desc: t(dict, "analytics.gross_desc") },
    { title: t(dict, "analytics.fees"),    value: fmt(fees),    icon: CreditCard, color: "text-muted-foreground", desc: t(dict, "analytics.fees_desc") },
    { title: t(dict, "analytics.payout"),  value: fmt(payout),  icon: DollarSign, color: "text-muted-foreground",   desc: t(dict, "analytics.payout_desc") },
    { title: t(dict, "analytics.refunds"), value: fmt(refunds), icon: Percent,    color: "text-muted-foreground",    desc: t(dict, "analytics.refunds_desc") },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t(dict, "analytics.title")}</h1>
        <p className="text-muted-foreground">{t(dict, "analytics.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>{t(dict, "analytics.by_channel")}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(byChannel).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{method.replace(/_/g, " ")}</span>
                <span className="font-medium">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tickets by type — paid vs free (spin-won) */}
      <Card>
        <CardHeader>
          <CardTitle>{t(dict, "analytics.by_type")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t(dict, "analytics.by_type_desc")}</p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <>
              <TicketTypeChart
                data={chartData}
                paidLabel={t(dict, "analytics.paid_tickets")}
                freeLabel={t(dict, "analytics.free_tickets")}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-left font-medium">{t(dict, "analytics.ticket_type")}</th>
                      <th className="py-2 text-right font-medium">{t(dict, "analytics.paid_tickets")}</th>
                      <th className="py-2 text-right font-medium">{t(dict, "analytics.free_tickets")}</th>
                      <th className="py-2 text-right font-medium">{t(dict, "analytics.revenue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byType.map((r) => (
                      <tr key={r.name} className="border-b last:border-0">
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right tabular-nums">{r.paid}</td>
                        <td className="py-2 text-right tabular-nums text-[#9FE870]">{r.free}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{fmt(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t(dict, "analytics.capacity")}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {events.map((event) => {
              const totalSold     = event.ticket_types.reduce((a, tt) => a + tt.sold, 0);
              const totalCapacity = event.ticket_types.reduce((a, tt) => a + tt.quantity, 0);
              const checkinRate   = totalSold > 0 ? Math.round((event.check_ins.length / totalSold) * 100) : 0;
              const pct           = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
              return (
                <div key={event.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{event.name}</span>
                    <span className="text-muted-foreground">{totalSold}/{totalCapacity} · {checkinRate}% {t(dict, "analytics.checked_in")}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t(dict, "analytics.recent")}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {paidOrders.slice(0, 10).map((order, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{order.guest_name ?? order.guest_email ?? t(dict, "analytics.registered")}</p>
                  <p className="text-xs text-muted-foreground">{(order as any).events?.name}</p>
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
