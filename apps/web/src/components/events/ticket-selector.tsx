"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Minus, Plus, Tag, Sparkles, AlertTriangle, LogIn, Smartphone, Wallet, CheckCircle2 } from "lucide-react";
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
  const searchParams = useSearchParams();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeSpinToken, setFreeSpinToken] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  // Hidden promo applied by scanning a QR (?promo=<id>) — code never shown.
  const [qrPromo, setQrPromo] = useState<{ id: string; label: string } | null>(null);
  // Credit redemption
  const [quote, setQuote] = useState<{ enabled: boolean; maxCredits: number; valueHuf: number } | null>(null);
  const [credits, setCredits] = useState(0);

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

  // Promo (manual code or scanned QR) and credits are mutually exclusive.
  const promoActive = !!promoCode.trim() || !!qrPromo;
  const creditDiscount = credits * (quote?.valueHuf ?? 0);
  const displayTotal = Math.max(0, subtotal - creditDiscount);

  // Resolve a scanned promo id → discount label (the code itself stays hidden).
  useEffect(() => {
    const pid = searchParams.get("promo");
    if (!pid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/promos/resolve?id=${encodeURIComponent(pid)}`);
        const d = await res.json();
        if (cancelled || !d?.valid) return;
        if (d.eventId && d.eventId !== eventId) return; // wrong event
        const label = d.discountType === "percent" ? `${d.discountValue}% ${dict["credits.redeem_off"]}` : `${fmt(d.discountValue)} ${dict["credits.redeem_off"]}`;
        setQrPromo({ id: d.id, label });
        setCredits(0); // either-or
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, eventId]);

  // Fetch the credit-redemption quote whenever the subtotal changes (logged-in,
  // no promo active). Gives the slider its max + per-credit value.
  const fetchQuote = useCallback(async (orderTotal: number) => {
    if (!isLoggedIn || orderTotal <= 0) { setQuote(null); return; }
    try {
      const res = await fetch("/api/credits/redeem-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderTotal }),
      });
      const d = await res.json();
      if (d?.enabled) setQuote({ enabled: true, maxCredits: d.maxCredits ?? 0, valueHuf: d.value ?? 0 });
      else setQuote(null);
    } catch { setQuote(null); }
  }, [isLoggedIn]);

  useEffect(() => {
    if (promoActive) { setQuote(null); setCredits(0); return; }
    void fetchQuote(subtotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, promoActive, fetchQuote]);

  // Keep the slider within the live max.
  useEffect(() => {
    if (quote && credits > quote.maxCredits) setCredits(quote.maxCredits);
  }, [quote, credits]);

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
          promoCode: !qrPromo && promoCode ? promoCode : undefined,
          promoId: qrPromo?.id || undefined,
          creditsToApply: credits > 0 ? credits : undefined,
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
          <div key={ticket.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="font-semibold tracking-tight">{ticket.name}</span>
                  <Badge variant="secondary" className="text-xs">{ticket.tier}</Badge>
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
                    <Badge className="text-xs bg-brand text-brand-foreground border-0">
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
                <p className="mt-1 font-semibold">
                  {ticket.price === 0 ? dict["ticket.free"] : fmt(effectivePrice(ticket))}
                  {ticket.saleEnabled && ticket.salePrice != null && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{fmt(ticket.price)}</span>
                  )}
                </p>
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
                  <span className="w-5 text-center text-sm font-medium">{qty}</span>
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
        );
      })}

      {/* Promo code — hidden QR banner, or a manual input (disabled while using credits) */}
      {qrPromo ? (
        <div className="flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 p-3">
          <CheckCircle2 className="h-4 w-4 text-brand shrink-0" />
          <span className="text-sm font-medium">{dict["ticket.promo_applied"]}</span>
          <Badge variant="secondary" className="ml-auto text-xs">{qrPromo.label}</Badge>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={dict["ticket.promo_code"]}
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className="pl-9"
              disabled={credits > 0}
            />
          </div>
        </div>
      )}

      {/* Summary + checkout */}
      {hasItems && (
        <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>{dict["ticket.subtotal"]}</span>
            <span className={freeSpinToken ? "line-through text-muted-foreground" : ""}>{fmt(subtotal)}</span>
          </div>

          {/* Credit redemption slider — logged-in, no promo, redemption enabled */}
          {!freeSpinToken && !promoActive && quote?.enabled && quote.maxCredits > 0 && (
            <div className="rounded-2xl bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--pastel-green)" }}>
                  <Wallet className="h-[15px] w-[15px]" style={{ color: "#163300" }} />
                </span>
                <span className="text-sm font-bold">{dict["credits.redeem_title"]}</span>
                <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#ECEADD", color: "#3A3608" }}>
                  {dict["credits.redeem_balance"]}: {quote.maxCredits}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={quote.maxCredits}
                step={1}
                value={credits}
                onChange={(e) => setCredits(parseInt(e.target.value, 10))}
                className="w-full"
                style={{ accentColor: "#163300" }}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: "#14160F" }}>
                  {credits} {dict["credits.redeem_credits"]}
                </span>
                <span className="text-base font-extrabold tabular-nums" style={{ color: "#163300" }}>
                  −{fmt(creditDiscount)} {dict["credits.redeem_off"]}
                </span>
              </div>
            </div>
          )}

          {credits > 0 && (
            <div className="flex justify-between text-sm">
              <span>{dict["credits.redeem_title"]}</span>
              <span className="font-semibold" style={{ color: "#163300" }}>−{fmt(creditDiscount)}</span>
            </div>
          )}

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
              {loading ? "…" : `${dict["ticket.checkout"]} · ${fmt(displayTotal)}`}
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
