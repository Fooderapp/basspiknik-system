"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, RefreshCw, Pencil, X, Clock, Loader2, AlertTriangle, Sparkles, Star } from "lucide-react";
import { SpinButton } from "@/components/credits/spin-button";
import type { Drink, DrinkCategory, DrinkCategoryRow } from "@/lib/supabase/types";
import type { Dictionary } from "@/lib/i18n";
import type { Currency } from "@/lib/settings";

interface CartItem { drink: Drink; quantity: number; notes?: string }

interface Props {
  drinks: Drink[];
  categories: DrinkCategoryRow[];
  dict: Dictionary;
  currency: Currency;
}

const ENUM_LABEL: Record<DrinkCategory, keyof Dictionary> = {
  COCKTAIL:   "menu.cat_cocktail",
  BEER:       "menu.cat_beer",
  WINE:       "menu.cat_wine",
  SPIRIT:     "menu.cat_spirit",
  SOFT_DRINK: "menu.cat_soft_drink",
  SHOT:       "menu.cat_shot",
  OTHER:      "menu.cat_other",
};

interface CategoryTab {
  key: string;
  label: string;
  color?: string;
  emoji?: string;
}

type OrderResult = { id: string; qrToken: string; total: number };

export function BarMenu({ drinks, categories, dict, currency }: Props) {
  const t = (key: keyof Dictionary) => dict[key] ?? key;
  const fmt = (amount: number) => formatCurrency(amount, currency);

  // ── state ──
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<"PENDING" | "IN_PROGRESS" | "FULFILLED" | "CANCELLED" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [freeSpinToken, setFreeSpinToken] = useState<string | null>(null);

  // ── derived: build unified category tabs ──
  const categoryTabs = useMemo((): CategoryTab[] => {
    const tabs: CategoryTab[] = [];
    const seenDbIds = new Set<string>();
    const seenEnums = new Set<DrinkCategory>();

    // First pass: DB categories (in sort_order) that have at least one drink
    for (const cat of categories) {
      if (drinks.some(d => d.category_id === cat.id)) {
        seenDbIds.add(cat.id);
        tabs.push({ key: `db:${cat.id}`, label: cat.name, color: cat.color, emoji: cat.emoji });
      }
    }

    // Second pass: enum categories for drinks without category_id
    for (const drink of drinks) {
      if (!drink.category_id && !seenEnums.has(drink.category)) {
        seenEnums.add(drink.category);
        tabs.push({ key: `enum:${drink.category}`, label: t(ENUM_LABEL[drink.category]) });
      }
    }

    return tabs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drinks, categories]);

  const filtered = useMemo(() => {
    if (activeCategory === "ALL") return drinks;
    if (activeCategory.startsWith("db:")) {
      const catId = activeCategory.slice(3);
      return drinks.filter(d => d.category_id === catId);
    }
    if (activeCategory.startsWith("enum:")) {
      const enumVal = activeCategory.slice(5) as DrinkCategory;
      return drinks.filter(d => !d.category_id && d.category === enumVal);
    }
    return drinks;
  }, [drinks, activeCategory]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => {
    const price = i.drink.sale_enabled && i.drink.sale_price ? i.drink.sale_price : i.drink.price;
    return s + price * i.quantity;
  }, 0);

  // ── cart helpers ──
  function addToCart(drink: Drink) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.drink.id === drink.id);
      if (idx >= 0) {
        return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { drink, quantity: 1 }];
    });
  }

  function removeFromCart(drinkId: string) {
    setCart((prev) => prev.filter((c) => c.drink.id !== drinkId));
  }

  function adjustQty(drinkId: string, delta: number) {
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.drink.id !== drinkId) return [c];
        const next = c.quantity + delta;
        return next <= 0 ? [] : [{ ...c, quantity: next }];
      })
    );
  }

  function getQty(drinkId: string) {
    return cart.find((c) => c.drink.id === drinkId)?.quantity ?? 0;
  }

  // ── place order ──
  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const res = await fetch("/api/bar/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim() || null,
          notes: orderNotes.trim() || null,
          items: cart.map((c) => ({ drinkId: c.drink.id, quantity: c.quantity, notes: c.notes ?? null })),
          freeSpinToken: freeSpinToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFreeSpinToken(null);

      // Generate QR
      const qr = await QRCode.toDataURL(data.qrToken, {
        width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(qr);
      setOrderResult(data);
      setOrderStatus("PENDING");
      setCart([]);
      setCartOpen(false);
      toast.success(t("menu.order_success"));

      // Poll for status updates
      startStatusPoll(data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  // ── poll order status ──
  function startStatusPoll(orderId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bar/orders/${orderId}`);
        if (!res.ok) { clearInterval(interval); return; }
        const data = await res.json();
        setOrderStatus(data.status);
        if (data.status === "FULFILLED" || data.status === "CANCELLED") clearInterval(interval);
      } catch { clearInterval(interval); }
    }, 5000);
  }

  // ── cancel order ──
  async function cancelOrder() {
    if (!orderResult) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/bar/orders/${orderResult.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Cannot cancel");
      }
      setOrderStatus("CANCELLED");
      toast.success("Order cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  }

  // ── edit order: restore cart and go back to menu ──
  function editOrder() {
    if (!orderResult) return;
    // We don't know the original items here — just return to menu
    // The order will be replaced when user places a new one
    // For simplicity: cancel the old order and start fresh
    setEditMode(true);
    setOrderResult(null);
    setQrDataUrl(null);
    setOrderStatus(null);
    setCartOpen(true);
  }

  function resetOrder() {
    setOrderResult(null);
    setQrDataUrl(null);
    setOrderStatus(null);
    setGuestName("");
    setOrderNotes("");
    setEditMode(false);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Order success / status screen
  if (orderResult) {
    const isPending    = orderStatus === "PENDING";
    const isInProgress = orderStatus === "IN_PROGRESS";
    const isFulfilled  = orderStatus === "FULFILLED";
    const isCancelled  = orderStatus === "CANCELLED";
    // Active = bartender has it or is waiting — block New Order until terminal state
    const isActive     = isPending || isInProgress;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-6 max-w-sm mx-auto">
        {/* Status icon */}
        <div className={`rounded-full p-5 ${
          isFulfilled  ? "bg-brand"
          : "bg-muted"
        }`}>
          {isFulfilled  ? <CheckCircle2 className="h-12 w-12 text-brand-foreground" />
          : isCancelled ? <X className="h-12 w-12 text-muted-foreground" />
          : isInProgress ? <Loader2 className="h-12 w-12 text-foreground animate-spin" />
          : <Clock className="h-12 w-12 text-foreground" />}
        </div>

        {/* Status text */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">
            {isFulfilled  ? t("menu.status_fulfilled")
            : isCancelled ? t("menu.status_cancelled")
            : isInProgress ? t("menu.status_progress")
            : t("menu.order_success")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isFulfilled  ? t("menu.show_qr")
            : isCancelled ? t("menu.status_cancelled")
            : isInProgress ? t("menu.no_edit_progress")
            : t("menu.order_success_sub")}
          </p>
        </div>

        {/* QR code — show while not cancelled */}
        {qrDataUrl && !isCancelled && (
          <div className="rounded-2xl border bg-card p-5 flex flex-col items-center gap-3 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Order QR" className="w-52 h-52 rounded-xl" />
            <p className="text-xs text-muted-foreground font-mono">{orderResult.qrToken}</p>
            <p className="text-sm font-semibold">{t("menu.total")}: {fmt(orderResult.total)}</p>
            {isPending && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t("menu.status_pending")}
              </div>
            )}
            {isInProgress && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("menu.status_progress")}
              </div>
            )}
          </div>
        )}

        {/* Action buttons — only available while PENDING; nothing while IN_PROGRESS */}
        <div className="flex flex-col gap-2 w-full">
          {isPending && (
            <>
              <Button variant="outline" className="w-full gap-2" onClick={editOrder}>
                <Pencil className="h-4 w-4" />
                Edit Order
              </Button>
              <Button
                variant="destructive" className="w-full gap-2"
                onClick={cancelOrder} disabled={cancelling}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Cancel Order
              </Button>
            </>
          )}

          {/* "New Order" only after terminal state — NOT while active */}
          {!isActive && (
            <Button variant="outline" onClick={resetOrder} className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              {t("menu.new_order")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main menu
  return (
    <div className="min-h-screen bg-background">

      {/* Header — mobile app parity */}
      <div className="mx-auto w-full max-w-4xl px-5 pt-4 pb-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("menu.title")}</h1>
        <p className="text-sm text-muted-foreground">{drinks.length} {t("menu.items_available")}</p>
      </div>

      {/* Category pills — emoji + category colour, like mobile */}
      <div className="mx-auto w-full max-w-4xl px-5 mb-2 flex gap-2 overflow-x-auto scrollbar-hide py-1">
        <button
          onClick={() => setActiveCategory("ALL")}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition-colors ${
            activeCategory === "ALL"
              ? "bg-[#0A0A0A] text-white border-transparent font-semibold"
              : "bg-card border-border text-muted-foreground font-medium"
          }`}
        >
          {t("menu.all")}
        </button>
        {categoryTabs.map((tab) => {
          const active = activeCategory === tab.key;
          const color = tab.color ?? "#888888";
          return (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              className="shrink-0 px-3 py-1.5 rounded-full text-[13px] whitespace-nowrap flex items-center gap-1.5 border transition-colors"
              style={
                active
                  ? { backgroundColor: color, borderColor: "transparent", color: "#fff", fontWeight: 600 }
                  : { backgroundColor: "#0a0a0a", borderColor: color + "55", color, fontWeight: 500 }
              }
            >
              {tab.emoji && <span>{tab.emoji}</span>}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Drink list — single column on mobile (app parity), grid on desktop */}
      <div className="mx-auto w-full max-w-4xl px-5 pt-2 pb-28">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t("menu.cat_other")}
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((drink) => {
              const effectivePrice = drink.sale_enabled && drink.sale_price ? drink.sale_price : drink.price;
              const qty = getQty(drink.id);
              return (
                <div key={drink.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 mr-3">
                      <p className="font-bold text-base tracking-tight leading-snug">{drink.name}</p>
                      {drink.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{drink.description}</p>
                      )}
                      {drink.allergens && drink.allergens.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-xs text-muted-foreground">{drink.allergens.join(", ")}</span>
                        </div>
                      )}
                      {drink.is_popular && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="h-3 w-3 fill-foreground text-foreground" strokeWidth={1.75} />
                          <span className="text-xs">{t("menu.popular")}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-base">{fmt(effectivePrice)}</p>
                      {drink.sale_enabled && drink.sale_price && (
                        <p className="text-xs text-muted-foreground line-through">{fmt(drink.price)}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {qty === 0 ? (
                      <button
                        onClick={() => addToCart(drink)}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95 transition-transform"
                      >
                        <Plus className="h-[15px] w-[15px]" strokeWidth={2.25} />
                        {t("menu.add")}
                      </button>
                    ) : (
                      <div className="flex items-center gap-4 rounded-xl border border-border bg-secondary px-4 py-2">
                        <button onClick={() => adjustQty(drink.id, -1)} className="active:scale-90 transition-transform">
                          <Minus className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                        <span className="w-6 text-center font-bold">{qty}</span>
                        <button onClick={() => adjustQty(drink.id, 1)} className="active:scale-90 transition-transform">
                          <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky bottom cart bar — white pill, like mobile */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed left-4 right-4 bottom-24 md:bottom-6 z-40 mx-auto flex max-w-md items-center rounded-[18px] bg-primary px-[18px] py-[14px] text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#0a0a0a] text-sm font-bold text-brand">
            {cartCount}
          </span>
          <span className="ml-3 flex flex-1 items-center gap-2">
            <ShoppingCart className="h-4 w-4" strokeWidth={2} />
            <span className="text-[15px] font-bold">{t("menu.view_order")}</span>
          </span>
          <span className="text-base font-extrabold">{fmt(cartTotal)}</span>
        </button>
      )}

      {/* Cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="flex flex-col h-[92vh] rounded-t-2xl sm:max-w-md sm:mx-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              {t("menu.cart_title")}
            </SheetTitle>
          </SheetHeader>

          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">{t("menu.cart_empty")}</p>
            </div>
          ) : (
            <>
              {/* Items */}
              <div className="flex-1 overflow-y-auto space-y-2 py-2">
                {cart.map((item) => {
                  const price = item.drink.sale_enabled && item.drink.sale_price ? item.drink.sale_price : item.drink.price;
                  return (
                    <div key={item.drink.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.drink.name}</p>
                        <p className="text-xs text-muted-foreground">{fmt(price)} × {item.quantity} = {fmt(price * item.quantity)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => adjustQty(item.drink.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => adjustQty(item.drink.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFromCart(item.drink.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order details */}
              <div className="border-t pt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="guest-name">{t("menu.guest_name")}</Label>
                  <Input
                    id="guest-name"
                    placeholder="e.g. Alex"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-notes">{t("menu.notes")}</Label>
                  <Textarea
                    id="order-notes"
                    placeholder="e.g. No ice in gin"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    maxLength={400}
                    rows={2}
                  />
                </div>
              </div>

              <SheetFooter className="flex-col gap-2 pt-2">
                <div className="flex justify-between font-bold text-base w-full">
                  <span>{t("menu.total")}</span>
                  <span className={freeSpinToken ? "line-through text-muted-foreground" : ""}>{fmt(cartTotal)}</span>
                </div>

                {!freeSpinToken && (
                  <SpinButton context="DRINK" dict={dict} onWin={setFreeSpinToken} />
                )}

                {freeSpinToken ? (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 gap-2"
                    size="lg" onClick={placeOrder} disabled={placing}
                  >
                    <Sparkles className="h-4 w-4" />
                    {placing ? t("menu.placing") : t("credits.claim_free_drink")}
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" onClick={placeOrder} disabled={placing}>
                    {placing ? t("menu.placing") : t("menu.place_order")}
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
