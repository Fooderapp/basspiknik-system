"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import { Minus, Plus, ScanLine, Sparkles, AlertTriangle, LogIn, Smartphone, Wallet, CheckCircle2 } from "lucide-react";
import { SpinButton } from "@/components/credits/spin-button";
import { t, type Dictionary } from "@/lib/i18n";
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
  comingSoon?: boolean;
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
  const pathname = usePathname();
  const signInHref = `/sign-in?redirectTo=${encodeURIComponent(pathname || "/events")}`;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [freeSpinToken, setFreeSpinToken] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  // Default document is a receipt (nyugta); opt in for a full invoice (számla),
  // which needs full billing details like a normal webshop.
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [bill, setBill] = useState({
    name: "", phone: "", country: "Magyarország", zip: "", city: "", address: "", tax: "",
  });
  const setBillField = (k: keyof typeof bill) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBill((b) => ({ ...b, [k]: e.target.value }));
  const invoiceComplete = !!(bill.name.trim() && bill.country.trim() && bill.zip.trim() && bill.city.trim() && bill.address.trim());

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

  // Scanned-QR promo and credits are mutually exclusive.
  const promoActive = !!qrPromo;
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
          promoId: qrPromo?.id || undefined,
          creditsToApply: credits > 0 ? credits : undefined,
          freeSpinToken: freeSpinToken || undefined,
          guestName: guest?.name || undefined,
          guestEmail: guest?.email || undefined,
          wantsInvoice: wantsInvoice || undefined,
          billing: wantsInvoice ? {
            name: bill.name.trim(), phone: bill.phone.trim() || undefined,
            country: bill.country.trim(), postalCode: bill.zip.trim(),
            city: bill.city.trim(), address: bill.address.trim(),
            taxNumber: bill.tax.trim() || undefined,
          } : undefined,
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

  const totalQty = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-[2px]" style={{ color: "#3C7A1E" }}>
        {t(dict, "event.select_tickets")}
      </p>

      {ticketTypes.map((ticket) => {
        const qty = quantities[ticket.id] ?? 0;
        const soon = !!ticket.comingSoon;
        const soldOut = !soon && ticket.available === 0;
        const selected = qty > 0 && !soon && !soldOut;
        return (
          <div
            key={ticket.id}
            className={`rounded-2xl border-2 bg-muted p-4 transition-colors ${soon || soldOut ? "opacity-60" : ""}`}
            style={{ borderColor: selected ? "#9FE870" : "transparent" }}
          >
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
                  {soon && (
                    <Badge className="text-xs border-0" style={{ background: "#16170F", color: "#fff" }}>{dict["home.coming_soon"]}</Badge>
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
              {!soldOut && !soon && (
                <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted"
                    onClick={() => updateQty(ticket.id, -1, Math.min(ticket.available, ticket.maxPerOrder))}
                    disabled={qty === 0}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted"
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
        <a
          href="/scan"
          className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          style={{ border: "1.5px dashed var(--border)", color: "#163300" }}
        >
          <ScanLine className="h-4 w-4" />
          {dict["ticket.scan_code"]}
        </a>
      )}

      {/* Summary + checkout — floats above the bottom nav on mobile */}
      {hasItems && (
        <div className="sticky bottom-24 z-30 rounded-[2.25rem] p-4 space-y-3 shadow-[0_8px_28px_rgba(20,22,15,0.14)] md:bottom-4" style={{ background: "#E5E5E5" }}>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
              {t(dict, "ticket.total")} ({totalQty} {totalQty === 1 ? t(dict, "ticket.ticket_singular") : t(dict, "ticket.ticket_plural")})
            </span>
            <span className={`text-xl font-extrabold tabular-nums ${freeSpinToken ? "line-through text-muted-foreground" : ""}`}>{fmt(subtotal)}</span>
          </div>

          {/* Credit redemption slider — logged-in, no promo, redemption enabled */}
          {!freeSpinToken && !promoActive && quote?.enabled && quote.maxCredits > 0 && (
            <div className="rounded-2xl p-3 space-y-2" style={{ background: "var(--muted)" }}>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 shrink-0" style={{ color: "#163300" }} />
                <span className="text-sm font-bold">{dict["credits.redeem_title"]}</span>
                <span className="ml-auto inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--background)", color: "#404040" }}>
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
                <span className="text-sm font-extrabold tabular-nums" style={{ color: "#163300" }}>
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

          {/* Receipt by default; opt in for a full invoice (számla) */}
          {!freeSpinToken && (
            <div className="rounded-2xl p-3 space-y-2" style={{ background: "var(--muted)" }}>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={wantsInvoice} onChange={(e) => setWantsInvoice(e.target.checked)} className="h-4 w-4" style={{ accentColor: "#163300" }} />
                {dict["invoice.request"]}
              </label>
              {wantsInvoice ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground">{dict["invoice.billing_hint"]}</p>
                  <Input value={bill.name} onChange={setBillField("name")} placeholder={dict["invoice.name"]} className="h-9" autoComplete="name" />
                  <Input value={bill.phone} onChange={setBillField("phone")} placeholder={dict["invoice.phone"]} className="h-9" autoComplete="tel" />
                  <Input value={bill.country} onChange={setBillField("country")} placeholder={dict["invoice.country"]} className="h-9" autoComplete="country-name" />
                  <div className="flex gap-2">
                    <Input value={bill.zip} onChange={setBillField("zip")} placeholder={dict["invoice.zip"]} className="h-9 w-1/3" autoComplete="postal-code" />
                    <Input value={bill.city} onChange={setBillField("city")} placeholder={dict["invoice.city"]} className="h-9 flex-1" autoComplete="address-level2" />
                  </div>
                  <Input value={bill.address} onChange={setBillField("address")} placeholder={dict["invoice.address"]} className="h-9" autoComplete="street-address" />
                  <Input value={bill.tax} onChange={setBillField("tax")} placeholder={dict["invoice.tax_number"]} className="h-9" />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{dict["invoice.receipt_default"]}</p>
              )}
            </div>
          )}

          {freeSpinToken ? (
            <Button
              className="w-full rounded-full bg-amber-500 hover:bg-amber-600 gap-2"
              size="lg"
              onClick={() => handleCheckout()}
              disabled={loading}
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "…" : dict["credits.claim_free"]}
            </Button>
          ) : (
            <Button variant="brand" className="w-full" size="lg" onClick={startCheckout} disabled={loading || (wantsInvoice && !invoiceComplete)}>
              {loading ? "…" : wantsInvoice && !invoiceComplete ? dict["invoice.fill_required"] : `${dict["ticket.checkout"]} · ${fmt(displayTotal)}`}
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
            <Button variant="brand" className="w-full" onClick={submitGuest} disabled={loading}>
              {loading ? "…" : `${dict["checkout.continue_guest"]} · ${fmt(subtotal)}`}
            </Button>
            <Button variant="brandOutline" className="w-full gap-2" asChild>
              <Link href={signInHref}>
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
