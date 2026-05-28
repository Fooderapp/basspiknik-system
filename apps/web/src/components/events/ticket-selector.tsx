"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { Minus, Plus, Tag } from "lucide-react";

interface TicketType {
  id: string;
  name: string;
  description?: string;
  price: number;
  saleEnabled: boolean;
  salePrice?: number;
  available: number;
  maxPerOrder: number;
  tier: string;
  isBundle: boolean;
  bundleSize?: number;
  entriesPerTicket: number;
}

interface TicketSelectorProps {
  eventId: string;
  ticketTypes: TicketType[];
}

export function TicketSelector({ eventId, ticketTypes }: TicketSelectorProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);

  const updateQty = (id: string, delta: number, max: number) => {
    setQuantities((prev) => {
      const current = prev[id] ?? 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [id]: next };
    });
  };

  const effectivePrice = (t: TicketType) => t.saleEnabled && t.salePrice != null ? t.salePrice : t.price;
  const subtotal = ticketTypes.reduce((sum, t) => sum + (quantities[t.id] ?? 0) * effectivePrice(t), 0);
  const hasItems = Object.values(quantities).some((q) => q > 0);

  const handleCheckout = async () => {
    if (!hasItems) return;
    setLoading(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

      const res = await fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, items, promoCode: promoCode || undefined }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      router.push(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {ticketTypes.map((ticket) => {
        const qty = quantities[ticket.id] ?? 0;
        const soldOut = ticket.available === 0;
        return (
          <div key={ticket.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="font-medium">{ticket.name}</span>
                  <Badge variant="outline" className="text-xs">{ticket.tier}</Badge>
                  {ticket.isBundle && <Badge variant="secondary" className="text-xs">Bundle ×{ticket.bundleSize}</Badge>}
                  {ticket.entriesPerTicket > 1 && <Badge variant="secondary" className="text-xs">×{ticket.entriesPerTicket} entries</Badge>}
                  {ticket.saleEnabled && <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 border-0">Sale</Badge>}
                  {soldOut && <Badge variant="destructive" className="text-xs">Sold Out</Badge>}
                </div>
                {ticket.description && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
                <p className="text-sm text-muted-foreground mt-1">{ticket.available} remaining</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="font-semibold text-lg">{formatCurrency(effectivePrice(ticket))}</span>
                  {ticket.saleEnabled && ticket.salePrice != null && (
                    <p className="text-xs text-muted-foreground line-through">{formatCurrency(ticket.price)}</p>
                  )}
                </div>
                {!soldOut && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQty(ticket.id, -1, Math.min(ticket.available, ticket.maxPerOrder))}
                      disabled={qty === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQty(ticket.id, 1, Math.min(ticket.available, ticket.maxPerOrder))}
                      disabled={qty >= Math.min(ticket.available, ticket.maxPerOrder)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Promo code */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary + checkout */}
      {hasItems && (
        <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Final total calculated at checkout including any discounts and taxes.</p>
          <Button className="w-full" size="lg" onClick={handleCheckout} disabled={loading}>
            {loading ? "Redirecting..." : `Checkout · ${formatCurrency(subtotal)}`}
          </Button>
        </div>
      )}
    </div>
  );
}
