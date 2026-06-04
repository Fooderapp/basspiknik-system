"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Minus, Plus, Tag, Sparkles, AlertTriangle, LogIn, Smartphone } from "lucide-react";
import { SpinButton } from "@/components/credits/spin-button";
import type { Dictionary } from "@/lib/i18n";
import type { Currency } from "@/lib/settings";

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
  dict: Dictionary;
  currency: Currency;
  isLoggedIn: boolean;
}

export function TicketSelector({ eventId, ticketTypes, dict, currency, isLoggedIn }: TicketSelectorProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeSpinToken, setFreeSpinToken] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

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

  const fmt = (amount: number) => formatCurrency(amount, currency);

  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  // Entry point from the main button: logged-in users go straight to checkout;
  // guests must fill the form first (no credits / spin / wallet pass as a guest).
  const startCheckout = () => {
    if (!hasItems) return;
    if (isLoggedIn || freeSpinToken) {
      void handleCheckout();
    } else {
      setGuestOpen(true);
    }
  };

  const handleCheckout = async (guest?: { name: string; email: string }) => {
    if (!hasItems) return;
    setLoading(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

      const res = await fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId, items,
          promoCode: promoCode || undefined,
          freeSpinToken: freeSpinToken || undefined,
          guestName: guest?.name || undefined,
          guestEmail: guest?.email || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? dict["ticket.checkout_failed"]);

      // Free-spin win returns an internal app path; Stripe returns an absolute URL.
      // router.push() runs an external URL through the WebKit URL parser and throws
      // "The string did not match the expected pattern." on iOS — use a hard nav.
      if (data.free || data.url?.startsWith("/")) {
        router.push(data.url);
      } else {
        window.location.assign(data.url);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : dict["ticket.checkout_failed"]);
    } finally {
      setLoading(false);
    }
  };

  const submitGuest = () => {
    if (!guestName.trim()) { toast.error(dict["checkout.name_required"]); return; }
    if (!isValidEmail(guestEmail)) { toast.error(dict["checkout.email_invalid"]); return; }
    setGuestOpen(false);
    void handleCheckout({ name: guestName.trim(), email: guestEmail.trim() });
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
                  {ticket.isBundle && (
                    <Badge variant="secondary" className="text-xs">
                      {dict["ticket.bundle"]} ×{ticket.bundleSize}
                    </Badge>
                  )}
                  {ticket.entriesPerTicket > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      ×{ticket.entriesPerTicket} {dict["ticket.entries"]}
                    </Badge>
                  )}
                  {ticket.saleEnabled && (
                    <Badge className="text-xs bg-foreground text-background border-0">
                      {dict["ticket.sale"]}
                    </Badge>
                  )}
                  {soldOut && (
                    <Badge variant="destructive" className="text-xs">{dict["ticket.sold_out"]}</Badge>
                  )}
                </div>
                {ticket.description && (
                  <p className="text-sm text-muted-foreground">{ticket.description}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {ticket.available} {dict["ticket.per_person"]}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="font-semibold text-lg">
                    {ticket.price === 0 ? dict["ticket.free"] : fmt(effectivePrice(ticket))}
                  </span>
                  {ticket.saleEnabled && ticket.salePrice != null && (
                    <p className="text-xs text-muted-foreground line-through">{fmt(ticket.price)}</p>
                  )}
                </div>
                {!soldOut && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => updateQty(ticket.id, -1, Math.min(ticket.available, ticket.maxPerOrder))}
                      disabled={qty === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{qty}</span>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8"
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
            placeholder={dict["ticket.promo_code"]}
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
            <span>{dict["ticket.subtotal"]}</span>
            <span className={freeSpinToken ? "line-through text-muted-foreground" : ""}>{fmt(subtotal)}</span>
          </div>

          {/* Free spin — server enforces eligibility */}
          {!freeSpinToken && (
            <SpinButton
              context="TICKET"
              eventId={eventId}
              items={Object.entries(quantities)
                .filter(([, q]) => q > 0)
                .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))}
              dict={dict}
              onWin={setFreeSpinToken}
            />
          )}

          {freeSpinToken ? (
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 gap-2"
              size="lg"
              onClick={() => handleCheckout()}
              disabled={loading}
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "…" : dict["credits.claim_free"]}
            </Button>
          ) : (
            <Button className="w-full" size="lg" onClick={startCheckout} disabled={loading}>
              {loading ? "…" : `${dict["ticket.checkout"]} · ${fmt(subtotal)}`}
            </Button>
          )}
        </div>
      )}

      {/* Guest checkout — collect contact details + explain what they miss */}
      <Dialog open={guestOpen} onOpenChange={setGuestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dict["checkout.guest_title"]}</DialogTitle>
            <DialogDescription>{dict["checkout.guest_subtitle"]}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">{dict["checkout.full_name"]}</Label>
              <Input
                id="guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={dict["checkout.full_name"]}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-email">{dict["checkout.email"]}</Label>
              <Input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">{dict["checkout.email_hint"]}</p>
            </div>
            <p className="text-xs text-muted-foreground">{dict["checkout.billing_note"]}</p>
          </div>

          {/* Upsell: what guests miss + how to get it */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">{dict["checkout.guest_warning"]}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Smartphone className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">{dict["checkout.app_hint"]}</p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={submitGuest} disabled={loading}>
              {loading ? "…" : `${dict["checkout.continue_guest"]} · ${fmt(subtotal)}`}
            </Button>
            <Button variant="outline" className="w-full gap-2" asChild>
              <Link href="/sign-in">
                <LogIn className="h-4 w-4" />
                {dict["checkout.login_register"]}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
