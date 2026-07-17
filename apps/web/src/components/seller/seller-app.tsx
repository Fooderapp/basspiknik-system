"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, ShoppingCart, CheckCircle2, Banknote, CreditCard, Smartphone, QrCode, UserCheck } from "lucide-react";
import type { Event, TicketType } from "@/lib/supabase/types";
import type { Dictionary } from "@/lib/i18n";
import { PassScanner } from "@/components/seller/pass-scanner";

type EventWithTickets = Event & { ticket_types: TicketType[] };

interface CartItem {
  ticketType: TicketType;
  quantity: number;
}

interface Props {
  events: EventWithTickets[];
  sellerId: string;
  dict: Dictionary;
  doorMode?: boolean;
}

type PaymentMethod = "CASH" | "CARD" | "TERMINAL";

const PAYMENT_ICONS: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  TERMINAL: <Smartphone className="h-4 w-4" />,
};

export function SellerApp({ events, dict, doorMode = false }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id ?? "");
  const [cart, setCart] = useState<CartItem[]>([]);
  const paymentMethod: PaymentMethod = "CASH"; // web POS is cash-only
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerUserId, setBuyerUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualId, setManualId] = useState("");

  async function resolveBuyer(walletToken: string) {
    setScanning(false);
    try {
      const res = await fetch("/api/seller/resolve-buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletToken }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? dict["seller.buyer_not_found"]); return; }
      setBuyerUserId(data.id);
      setBuyerName(data.name ?? "");
      setBuyerEmail(data.email ?? "");
      toast.success(`${dict["seller.buyer_linked"]} ${data.name ?? ""}`.trim());
    } catch {
      toast.error(dict["seller.buyer_not_found"]);
    }
  }
  const [lastReceipt, setLastReceipt] = useState<{ orderId: string; total: number; qty: number; qrs: string[] } | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const now = new Date();
  const availableTickets = selectedEvent?.ticket_types.filter(
    (t) =>
      (doorMode ? t.is_door_ticket : !t.is_door_ticket) &&
      t.quantity - t.sold > 0 &&
      (!t.sale_starts_at || new Date(t.sale_starts_at) <= now) &&
      (!t.sale_ends_at   || new Date(t.sale_ends_at)   >= now)
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

  const handleSubmit = async (): Promise<boolean> => {
    if (!selectedEventId || cart.length === 0) return false;
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
          buyerUserId: buyerUserId || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? dict["seller.sale_failed"]);
      }

      const result = await res.json();
      setLastReceipt({ orderId: result.orderId, total: result.totalAmount, qty: result.totalQty, qrs: result.ticketQrs ?? [] });
      setCart([]);
      setBuyerName("");
      setBuyerEmail("");
      setBuyerUserId(null);
      setNotes("");
      toast.success(`${dict["seller.sale_success"]} ${result.totalQty} ${dict["seller.sold"]}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : dict["seller.error"]);
      return false;
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
          <h2 className="text-2xl font-bold mb-1">{dict["seller.sale_complete"]}</h2>
          <p className="text-muted-foreground">
            {lastReceipt.qty} {dict["seller.sold"]} · {formatCurrency(lastReceipt.total)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{dict["seller.order_no"]}{lastReceipt.orderId.slice(0, 8).toUpperCase()}</p>
        </div>

        {/* Entry QR(s) — show so the buyer can scan in immediately, even without email */}
        {lastReceipt.qrs.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{dict["seller.entry_qr"]}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {lastReceipt.qrs.map((code) => (
                <div key={code} className="rounded-2xl bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/tickets/qr?code=${encodeURIComponent(code)}`} alt="Entry QR" width={132} height={132} />
                </div>
              ))}
            </div>
          </div>
        )}

        <Button size="lg" onClick={() => setLastReceipt(null)}>
          {dict["seller.new_sale"]}
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
          <Label>{dict["seller.event_label"]}</Label>
          <Select value={selectedEventId} onValueChange={(v) => { setSelectedEventId(v); setCart([]); }}>
            <SelectTrigger>
              <SelectValue placeholder={dict["seller.event_ph"]} />
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
            {dict["seller.no_tickets"]}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[2px]" style={{ color: "#3C7A1E" }}>
              {dict["event.select_tickets"]}
            </p>
            {availableTickets.map((tt) => {
              const qty = getQty(tt.id);
              const available = tt.quantity - tt.sold;
              const selected = qty > 0;
              return (
                <div
                  key={tt.id}
                  className="flex items-center justify-between rounded-2xl border-2 bg-muted p-4 transition-colors"
                  style={{ borderColor: selected ? "#9FE870" : "transparent" }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tt.name}</span>
                      <Badge variant="outline" className="text-[10px]">{tt.tier}</Badge>
                    </div>
                    {tt.description && <p className="text-xs text-muted-foreground mt-0.5">{tt.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-bold">{formatCurrency(tt.price)}</span>
                      <span className="text-xs text-muted-foreground">{available} {dict["seller.left"]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
                    <Button
                      type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted"
                      onClick={() => setQty(tt, qty - 1)} disabled={qty === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-mono font-bold tabular-nums">{qty}</span>
                    <Button
                      type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted"
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
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">{dict["seller.buyer_info"]}</Label>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setScanning(true)}>
              {buyerUserId ? <UserCheck className="h-4 w-4 text-green-600" /> : <QrCode className="h-4 w-4" />}
              <span className="text-xs">{buyerUserId ? dict["seller.buyer_linked"] : dict["seller.scan_pass"]}</span>
            </Button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualId.trim()) { resolveBuyer(manualId.trim()); setManualId(""); }
            }}
          >
            <Input
              placeholder={dict["seller.bass_id_ph"]}
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              className="text-xs h-8"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!manualId.trim()} className="h-8 shrink-0">
              {dict["seller.bass_id_lookup"]}
            </Button>
          </form>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="buyerName" className="text-xs">{dict["seller.buyer_name"]}</Label>
              <Input id="buyerName" placeholder="Jane Smith" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyerEmail" className="text-xs">{dict["seller.buyer_email"]}</Label>
              <Input id="buyerEmail" type="email" placeholder="jane@example.com" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs">{dict["seller.notes"]}</Label>
            <Input id="notes" placeholder={dict["seller.notes_ph"]} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Right — cart & checkout */}
      <div className="p-4 flex flex-col gap-4 bg-muted/30">
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" /> {dict["seller.cart"]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{dict["seller.cart_empty"]}</p>
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
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
                    {dict["ticket.total"]} ({cartQty} {cartQty === 1 ? dict["ticket.ticket_singular"] : dict["ticket.ticket_plural"]})
                  </span>
                  <span className="text-xl font-extrabold tabular-nums">{formatCurrency(cartTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment method — web POS is cash-only (card needs mobile Tap to Pay
            or a physical Stripe Terminal reader). */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{dict["seller.payment_method"]}</Label>
          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              variant="default"
              className="flex flex-col h-auto py-3 gap-1"
            >
              {PAYMENT_ICONS.CASH}
              <span className="text-[10px]">CASH</span>
            </Button>
          </div>
        </div>

        <SlideToConfirm
          label={submitting ? dict["seller.processing"] : `${dict["seller.charge"]} ${formatCurrency(cartTotal)}`}
          confirmedLabel={dict["seller.sale_success"] ?? "Sold!"}
          color="#9FE870"
          disabled={cart.length === 0 || submitting || !selectedEventId}
          onConfirm={async () => {
            const ok = await handleSubmit();
            if (!ok) throw new Error("sale failed");
          }}
        />
      </div>

      {scanning && (
        <PassScanner dict={dict} onResult={resolveBuyer} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
