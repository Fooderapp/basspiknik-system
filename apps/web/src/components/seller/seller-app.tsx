"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, ShoppingCart, CheckCircle2, Banknote, CreditCard, Smartphone } from "lucide-react";
import type { Event, TicketType } from "@/lib/supabase/types";

type EventWithTickets = Event & { ticket_types: TicketType[] };

interface CartItem {
  ticketType: TicketType;
  quantity: number;
}

interface Props {
  events: EventWithTickets[];
  sellerId: string;
}

type PaymentMethod = "CASH" | "CARD" | "TERMINAL";

const PAYMENT_ICONS: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  TERMINAL: <Smartphone className="h-4 w-4" />,
};

export function SellerApp({ events }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id ?? "");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ orderId: string; total: number; qty: number } | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const availableTickets = selectedEvent?.ticket_types.filter(
    (t) => t.quantity - t.sold > 0
  ) ?? [];

  const cartTotal = cart.reduce((sum, i) => sum + i.ticketType.price * i.quantity, 0);
  const cartQty = cart.reduce((sum, i) => sum + i.quantity, 0);

  const setQty = (tt: TicketType, qty: number) => {
    const max = tt.quantity - tt.sold;
    const clamped = Math.max(0, Math.min(qty, tt.max_per_order > 0 ? Math.min(tt.max_per_order, max) : max));
    setCart((prev) => {
      const existing = prev.find((i) => i.ticketType.id === tt.id);
      if (clamped === 0) return prev.filter((i) => i.ticketType.id !== tt.id);
      if (existing) return prev.map((i) => i.ticketType.id === tt.id ? { ...i, quantity: clamped } : i);
      return [...prev, { ticketType: tt, quantity: clamped }];
    });
  };

  const getQty = (ttId: string) => cart.find((i) => i.ticketType.id === ttId)?.quantity ?? 0;

  const handleSubmit = async () => {
    if (!selectedEventId || cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/seller/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          paymentMethod,
          items: cart.map((i) => ({
            ticketTypeId: i.ticketType.id,
            quantity: i.quantity,
            unitPrice: i.ticketType.price,
          })),
          buyerName: buyerName || undefined,
          buyerEmail: buyerEmail || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Sale failed");
      }

      const result = await res.json();
      setLastReceipt({ orderId: result.orderId, total: result.totalAmount, qty: result.totalQty });
      setCart([]);
      setBuyerName("");
      setBuyerEmail("");
      setNotes("");
      toast.success(`Sale complete — ${result.totalQty} ticket(s) sold`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Receipt screen ---
  if (lastReceipt) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 p-6 text-center">
        <div className="rounded-full bg-muted p-6">
          <CheckCircle2 className="h-16 w-16 text-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-1">Sale Complete!</h2>
          <p className="text-muted-foreground">
            {lastReceipt.qty} ticket{lastReceipt.qty !== 1 ? "s" : ""} · {formatCurrency(lastReceipt.total)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Order #{lastReceipt.orderId.slice(0, 8).toUpperCase()}</p>
        </div>
        <Button size="lg" onClick={() => setLastReceipt(null)}>
          New Sale
        </Button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-0 min-h-[calc(100vh-57px)]">
      {/* Left — ticket picker */}
      <div className="lg:col-span-2 p-4 space-y-4 border-r">
        {/* Event selector */}
        <div className="space-y-1">
          <Label>Event</Label>
          <Select value={selectedEventId} onValueChange={(v) => { setSelectedEventId(v); setCart([]); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select event…" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                  <Badge variant="outline" className="ml-2 text-[10px]">{e.status}</Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ticket types */}
        {availableTickets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            No available ticket types for this event.
          </div>
        ) : (
          <div className="space-y-3">
            <Label>Ticket Types</Label>
            {availableTickets.map((tt) => {
              const qty = getQty(tt.id);
              const available = tt.quantity - tt.sold;
              return (
                <div key={tt.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tt.name}</span>
                      <Badge variant="outline" className="text-[10px]">{tt.tier}</Badge>
                    </div>
                    {tt.description && <p className="text-xs text-muted-foreground mt-0.5">{tt.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-bold">{formatCurrency(tt.price)}</span>
                      <span className="text-xs text-muted-foreground">{available} left</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setQty(tt, qty - 1)} disabled={qty === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-mono font-bold">{qty}</span>
                    <Button
                      type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setQty(tt, qty + 1)} disabled={qty >= available}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Optional buyer info */}
        <div className="space-y-3 pt-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Buyer Info (optional)</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="buyerName" className="text-xs">Name</Label>
              <Input id="buyerName" placeholder="Jane Smith" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyerEmail" className="text-xs">Email</Label>
              <Input id="buyerEmail" type="email" placeholder="jane@example.com" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs">Notes</Label>
            <Input id="notes" placeholder="e.g. paid in cash, group booking…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Right — cart & checkout */}
      <div className="p-4 flex flex-col gap-4 bg-muted/30">
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" /> Cart
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Add tickets from the left</p>
            ) : (
              <>
                {cart.map((item) => (
                  <div key={item.ticketType.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {item.ticketType.name} × {item.quantity}
                    </span>
                    <span className="font-medium">{formatCurrency(item.ticketType.price * item.quantity)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total ({cartQty} ticket{cartQty !== 1 ? "s" : ""})</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment method */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Payment Method</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["CASH", "CARD", "TERMINAL"] as PaymentMethod[]).map((method) => (
              <Button
                key={method}
                type="button"
                variant={paymentMethod === method ? "default" : "outline"}
                className="flex flex-col h-auto py-3 gap-1"
                onClick={() => setPaymentMethod(method)}
              >
                {PAYMENT_ICONS[method]}
                <span className="text-[10px]">{method}</span>
              </Button>
            ))}
          </div>
        </div>

        <Button
          size="lg"
          className="w-full"
          disabled={cart.length === 0 || submitting || !selectedEventId}
          onClick={handleSubmit}
        >
          {submitting ? "Processing…" : `Charge ${formatCurrency(cartTotal)}`}
        </Button>
      </div>
    </div>
  );
}
