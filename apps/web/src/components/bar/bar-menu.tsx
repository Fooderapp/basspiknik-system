"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ShoppingCart, Plus, Minus, Trash2, Wine, CheckCircle2, RefreshCw, Pencil, X, Clock, Loader2, AlertTriangle, Sparkles } from "lucide-react";
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
        tabs.push({ key: `db:${cat.id}`, label: cat.name, color: cat.color });
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
          isFulfilled  ? "bg-foreground"
          : "bg-muted"
        }`}>
          {isFulfilled  ? <CheckCircle2 className="h-12 w-12 text-background" />
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

      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-20">
        <div className="container max-w-4xl py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Wine className="h-5 w-5 text-primary" />
              {t("menu.title")}
            </h1>
            <p className="text-sm text-muted-foreground hidden sm:block">{t("menu.subtitle")}</p>
          </div>
          <Button
            variant={cartCount > 0 ? "default" : "outline"}
            onClick={() => setCartOpen(true)}
            className="gap-2 relative"
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="font-semibold">{cartCount}</span>
            )}
            {cartCount > 0 && (
              <span className="ml-1 font-semibold">{fmt(cartTotal)}</span>
            )}
          </Button>
        </div>

        {/* Category tabs */}
        <div className="container max-w-4xl pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveCategory("ALL")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === "ALL"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t("menu.all")}
          </button>
          {categoryTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeCategory === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drink grid */}
      <div className="container max-w-4xl py-6">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t("menu.cat_other")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((drink) => {
              const effectivePrice = drink.sale_enabled && drink.sale_price ? drink.sale_price : drink.price;
              const qty = getQty(drink.id);
              return (
                <div key={drink.id} className="rounded-xl border bg-card overflow-hidden flex flex-col">
                  {drink.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={drink.image_url} alt={drink.name} className="w-full h-36 object-cover" />
                  )}
                  <div className="p-4 flex flex-col flex-1 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          {drink.is_popular && (
                            <Badge className="text-[10px] px-1.5 py-0">{t("menu.popular")}</Badge>
                          )}
                          {drink.sale_enabled && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t("menu.sale")}</Badge>
                          )}
                        </div>
                        <p className="font-semibold text-sm leading-snug">{drink.name}</p>
                        {drink.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{drink.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">{fmt(effectivePrice)}</p>
                        {drink.sale_enabled && drink.sale_price && (
                          <p className="text-xs text-muted-foreground line-through">{fmt(drink.price)}</p>
                        )}
                      </div>
                    </div>

                    {drink.allergens && drink.allergens.length > 0 && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {drink.allergens.join(", ")}
                      </p>
                    )}

                    <div className="mt-auto pt-2">
                      {qty === 0 ? (
                        <Button size="sm" className="w-full gap-1.5" onClick={() => addToCart(drink)}>
                          <Plus className="h-3.5 w-3.5" />
                          {t("menu.add")}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => adjustQty(drink.id, -1)}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="flex-1 text-center font-semibold text-sm">{qty}</span>
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => adjustQty(drink.id, 1)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-md">
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
