"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wine, Clock, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import type { DrinkOrderStatus } from "@/lib/supabase/types";
import type { Dictionary } from "@/lib/i18n";
import type { Currency } from "@/lib/settings";

interface DrinkOrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  fulfilled_at: string | null;
  drinks: { name: string; category: string } | null;
}

interface DrinkOrder {
  id: string;
  guest_name: string | null;
  notes: string | null;
  status: DrinkOrderStatus;
  is_vip: boolean;
  paid_online: boolean;
  total: number;
  qr_token: string;
  created_at: string;
  drink_order_items: DrinkOrderItem[];
}

interface Props {
  initialOrders: DrinkOrder[];
  dict: Dictionary;
  currency: Currency;
}

const STATUS_COLORS: Record<DrinkOrderStatus, string> = {
  PENDING:     "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  FULFILLED:   "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  CANCELLED:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function BartenderQueue({ initialOrders, dict, currency }: Props) {
  const t = (key: keyof Dictionary) => dict[key] ?? key;
  const fmt = (amount: number) => formatCurrency(amount, currency);

  const [orders, setOrders] = useState<DrinkOrder[]>(initialOrders);
  const [updating, setUpdating] = useState<string | null>(null);
  const [, setTick] = useState(0); // force re-render for timeAgo

  // ── Tick every 30s to refresh time labels ──
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Supabase Realtime subscription ──
  const refreshOrders = useCallback(async () => {
    const res = await fetch("/api/bar/orders?status=PENDING,IN_PROGRESS");
    if (res.ok) {
      const data = await res.json();
      setOrders((prev) => {
        // merge: keep FULFILLED/CANCELLED locally for the current session tab
        const activeIds = new Set((data as DrinkOrder[]).map((o) => o.id));
        const kept = prev.filter((o) => !activeIds.has(o.id) && o.status !== "PENDING" && o.status !== "IN_PROGRESS");
        return [...(data as DrinkOrder[]), ...kept];
      });
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("drink_orders_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drink_orders" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            // Fetch full order with items (staff auth is checked server-side)
            const res = await fetch(`/api/bar/orders/${(payload.new as DrinkOrder).id}`);
            if (res.ok) {
              const newOrder = await res.json();
              setOrders((prev) => {
                if (prev.some((o) => o.id === newOrder.id)) return prev;
                if (newOrder.is_vip) toast.success(`⭐ VIP order: ${newOrder.guest_name ?? "Guest"}`);
                else toast.info(`New order: ${newOrder.guest_name ?? "Guest"} · ${fmt(newOrder.total)}`);
                return [newOrder, ...prev];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === (payload.new as DrinkOrder).id
                  ? { ...o, status: (payload.new as DrinkOrder).status }
                  : o
              )
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update status ──
  async function updateStatus(orderId: string, status: DrinkOrderStatus) {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/bar/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setOrders((prev) =>
        prev.map((o) => o.id === orderId ? { ...o, status } : o)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setUpdating(null);
    }
  }

  const pending     = orders.filter((o) => o.status === "PENDING");
  const inProgress  = orders.filter((o) => o.status === "IN_PROGRESS");
  const done        = orders.filter((o) => o.status === "FULFILLED" || o.status === "CANCELLED");

  function OrderCard({ order }: { order: DrinkOrder }) {
    const isUpdating = updating === order.id;
    return (
      <div className={`rounded-xl border bg-card overflow-hidden ${order.is_vip ? "border-amber-400 dark:border-amber-500" : ""}`}>
        {order.is_vip && (
          <div className="bg-amber-400 dark:bg-amber-500 px-4 py-1 flex items-center gap-1.5 text-amber-950 dark:text-amber-950 text-xs font-bold">
            ⭐ {t("bar.vip")}
          </div>
        )}
        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{order.guest_name ?? "Guest"}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(order.created_at)}</p>
            </div>
            <div className="text-right">
              <Badge className={`${STATUS_COLORS[order.status]} border-0 text-xs`}>
                {t(`bar.status_${order.status.toLowerCase()}` as keyof Dictionary)}
              </Badge>
              <p className="text-xs font-mono text-muted-foreground mt-1">{order.qr_token.slice(0, 8)}</p>
            </div>
          </div>

          {/* Items */}
          <ul className="space-y-1">
            {order.drink_order_items.map((item) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.quantity}× {item.drinks?.name ?? "?"}
                  {item.notes && <span className="text-xs italic ml-1">({item.notes})</span>}
                </span>
                <span className="font-medium">{fmt(item.unit_price * item.quantity)}</span>
              </li>
            ))}
          </ul>

          {/* Order notes */}
          {order.notes && (
            <p className="text-xs bg-muted rounded px-2 py-1 text-muted-foreground italic">
              💬 {order.notes}
            </p>
          )}

          {/* Total */}
          <div className="flex justify-between font-bold text-sm border-t pt-2">
            <span>{t("bar.total")}</span>
            <span>{fmt(order.total)}</span>
          </div>

          {/* Actions */}
          {order.status === "PENDING" && (
            <div className="flex gap-2">
              <Button
                size="sm" className="flex-1 gap-1.5" variant="outline"
                disabled={isUpdating}
                onClick={() => updateStatus(order.id, "IN_PROGRESS")}
              >
                {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                {t("bar.start")}
              </Button>
              <Button
                size="sm" className="flex-1 gap-1.5" variant="destructive"
                disabled={isUpdating}
                onClick={() => updateStatus(order.id, "CANCELLED")}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("bar.cancel")}
              </Button>
            </div>
          )}
          {order.status === "IN_PROGRESS" && (
            <div className="flex gap-2">
              <Button
                size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                disabled={isUpdating}
                onClick={() => updateStatus(order.id, "FULFILLED")}
              >
                {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {t("bar.fulfill")}
              </Button>
              <Button
                size="sm" variant="destructive" className="flex-1 gap-1.5"
                disabled={isUpdating}
                onClick={() => updateStatus(order.id, "CANCELLED")}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("bar.cancel")}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function EmptyState() {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center space-y-2">
        <Wine className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">{t("bar.no_orders")}</p>
        <p className="text-sm text-muted-foreground">{t("bar.no_orders_sub")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container max-w-5xl py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wine className="h-5 w-5 text-primary" />
              {t("bar.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("bar.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={refreshOrders}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="container max-w-5xl py-6">
        <Tabs defaultValue="pending">
          <TabsList className="mb-6">
            <TabsTrigger value="pending" className="gap-2">
              {t("bar.tab_pending")}
              {pending.length > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-xs">{pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="gap-2">
              {t("bar.tab_in_progress")}
              {inProgress.length > 0 && (
                <Badge className="h-5 px-1.5 text-xs bg-blue-500 text-white">{inProgress.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="done">{t("bar.tab_done")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pending.length === 0 ? <EmptyState /> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pending.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="in_progress">
            {inProgress.length === 0 ? <EmptyState /> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {inProgress.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="done">
            {done.length === 0 ? <EmptyState /> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {done.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
