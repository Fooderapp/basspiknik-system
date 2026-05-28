import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, stripeFee, estimatedPayout } from "@/lib/utils";
import { TrendingUp, DollarSign, CreditCard, Percent } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import type { Order, Event } from "@/lib/supabase/types";

type OrderWithEvent = Order & { events: { name: string } | null };
type EventWithRelations = Event & {
  ticket_types: Array<{ quantity: number; sold: number }>;
  check_ins: Array<unknown>;
};

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: paidRaw },
    { data: refundedRaw },
    { data: eventsRaw },
  ] = await Promise.all([
    supabase.from("orders").select("total, payment_method, guest_name, guest_email, created_at, events(name)").eq("status", "PAID").order("created_at", { ascending: false }),
    supabase.from("orders").select("total").eq("status", "REFUNDED"),
    supabase.from("events").select("id, name, ticket_types(quantity, sold), check_ins(id)").eq("status", "PUBLISHED"),
  ]);

  const paidOrders = (paidRaw as OrderWithEvent[] | null) ?? [];
  const refunds = ((refundedRaw as Array<{ total: number }> | null) ?? []).reduce((s, o) => s + o.total, 0);
  const events = (eventsRaw as EventWithRelations[] | null) ?? [];

  const gross = paidOrders.reduce((s, o) => s + o.total, 0);
  const fees = stripeFee(gross);
  const payout = estimatedPayout(gross, refunds);
  const byChannel = paidOrders.reduce((acc, o) => {
    acc[o.payment_method] = (acc[o.payment_method] ?? 0) + o.total;
    return acc;
  }, {} as Record<string, number>);

  const cards = [
    { title: "Gross Revenue", value: formatCurrency(gross), icon: TrendingUp, color: "text-green-500", desc: "Total before fees" },
    { title: "Stripe Fees", value: formatCurrency(fees), icon: CreditCard, color: "text-orange-500", desc: "2.9% + $0.30/txn" },
    { title: "Est. Payout", value: formatCurrency(payout), icon: DollarSign, color: "text-blue-500", desc: "After fees & refunds" },
    { title: "Refunds", value: formatCurrency(refunds), icon: Percent, color: "text-red-500", desc: "Total refunded" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Revenue and payout overview</p>
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
        <CardHeader><CardTitle>Revenue by Channel</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(byChannel).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{method.replace(/_/g, " ")}</span>
                <span className="font-medium">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Event Capacity</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {events.map((event) => {
              const totalSold = event.ticket_types.reduce((a, t) => a + t.sold, 0);
              const totalCapacity = event.ticket_types.reduce((a, t) => a + t.quantity, 0);
              const checkinRate = totalSold > 0 ? Math.round((event.check_ins.length / totalSold) * 100) : 0;
              const pct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
              return (
                <div key={event.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{event.name}</span>
                    <span className="text-muted-foreground">{totalSold}/{totalCapacity} · {checkinRate}% checked in</span>
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
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {paidOrders.slice(0, 10).map((order, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{order.guest_name ?? order.guest_email ?? "Registered user"}</p>
                  <p className="text-xs text-muted-foreground">{order.events?.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(order.total)}</p>
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
