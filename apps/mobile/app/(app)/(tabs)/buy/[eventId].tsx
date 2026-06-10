import { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStripe, initStripe } from "@stripe/stripe-react-native";
import { ChevronLeft, Minus, Plus, Tag, CalendarDays, MapPin, Sparkles, Star, Wallet } from "lucide-react-native";
import { Slider } from "@/components/ui/Slider";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { OnboardingModal } from "@/components/OnboardingModal";
import { SpinModal } from "@/components/SpinModal";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Event, TicketType } from "@/lib/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

function billingComplete(p: { billing_name?: string | null; billing_address?: string | null; billing_city?: string | null; billing_postal_code?: string | null; onboarded_at?: string | null } | null): boolean {
  if (!p) return false;
  return !!(p.onboarded_at && p.billing_name && p.billing_address && p.billing_city && p.billing_postal_code);
}

export default function BuyEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [currency, setCurrency] = useState("HUF");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // Spin state
  const [credits, setCredits]       = useState(0);
  const [spinCost, setSpinCost]     = useState(4);
  const [spinEnabled, setSpinEnabled] = useState(false);
  const [spinOpen, setSpinOpen]     = useState(false);
  const [spinning, setSpinning]     = useState(false);
  const [spinResult, setSpinResult] = useState<{ win: boolean; token?: string; balance?: number } | null>(null);
  const [freeToken, setFreeToken]   = useState<string | null>(null);
  const [spinEligible, setSpinEligible] = useState(false);

  // Credit redemption (apply credits as a checkout discount)
  const [redeemMax, setRedeemMax]       = useState(0);
  const [redeemValue, setRedeemValue]   = useState(0);
  const [redeemCredits, setRedeemCredits] = useState(0);

  // Fetch credit balance + settings — called on mount and every time screen focuses
  const fetchCredits = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`${API_URL}/api/credits/balance`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCredits(data.balance ?? 0);
      setSpinCost(data.spinCost ?? 4);
      setSpinEnabled(data.enabled ?? false);
    } catch { /* silent — banner just stays hidden */ }
  }, [session]);

  useEffect(() => {
    (async () => {
      const [{ data: ev }, { data: settings }] = await Promise.all([
        (supabase as any).from("events").select("*, ticket_types(*)").eq("id", eventId).eq("status", "PUBLISHED").single(),
        (supabase as any).from("app_settings").select("currency").single(),
      ]);
      if (ev) {
        setEvent(ev as Event);
        // Door tickets are POS-only — never sold in-app.
        setTicketTypes(((ev.ticket_types as TicketType[]) ?? []).filter((t) => !(t as any).is_door_ticket));
      }
      if (settings?.currency) setCurrency(settings.currency);
      await fetchCredits();
      setLoading(false);
    })();
  }, [eventId, fetchCredits]);

  // Refresh balance whenever user navigates back to this screen
  useFocusEffect(useCallback(() => { void fetchCredits(); }, [fetchCredits]));

  // Re-check spin eligibility whenever the cart changes (conditions + credits).
  useEffect(() => {
    if (!session || !spinEnabled) { setSpinEligible(false); return; }
    const items = Object.entries(quantities).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    if (items.length === 0) { setSpinEligible(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/credits/spin-eligibility`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ eventId, items }),
        });
        const data = await res.json();
        if (!cancelled) setSpinEligible(!!data.eligible);
      } catch { if (!cancelled) setSpinEligible(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [quantities, spinEnabled, session, eventId]);

  const fmt = (n: number) => formatCurrency(n, currency);
  const priceOf = (t: TicketType) => (t.sale_enabled && t.sale_price != null ? t.sale_price : t.price);
  const subtotal = ticketTypes.reduce((s, t) => s + (quantities[t.id] ?? 0) * priceOf(t), 0);
  const hasItems = Object.values(quantities).some((q) => q > 0);

  // Promo and credits are mutually exclusive.
  const promoActive = !!promoCode.trim();
  const redeemDiscount = redeemCredits * redeemValue;
  const displayTotal = Math.max(0, subtotal - redeemDiscount);

  // Fetch the credit-redemption quote when the cart total changes (no promo).
  useEffect(() => {
    if (!session || promoActive || subtotal <= 0) {
      setRedeemMax(0); setRedeemValue(0); setRedeemCredits(0);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/credits/redeem-quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ orderTotal: subtotal }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.enabled && (data.maxCredits ?? 0) > 0) {
          setRedeemMax(data.maxCredits);
          setRedeemValue(data.value ?? 0);
          setRedeemCredits((c) => Math.min(c, data.maxCredits));
        } else {
          setRedeemMax(0); setRedeemValue(0); setRedeemCredits(0);
        }
      } catch { if (!cancelled) { setRedeemMax(0); setRedeemValue(0); } }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [subtotal, promoActive, session]);

  function updateQty(t: TicketType, delta: number) {
    const max = Math.min(t.quantity - t.sold, t.max_per_order);
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(max, (prev[t.id] ?? 0) + delta));
      return { ...prev, [t.id]: next };
    });
  }

  async function doSpin() {
    if (!session || !hasItems) return;
    setSpinning(true);
    setSpinResult(null);
    try {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
      const res = await fetch(`${API_URL}/api/credits/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ context: "TICKET", eventId, items }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Spin failed", data.error ?? "Try again"); return; }
      setSpinResult({ win: !!data.win, token: data.token, balance: data.balance });
      setCredits(data.balance ?? credits);
      if (data.win && data.token) setFreeToken(data.token);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSpinning(false);
    }
  }

  async function freeCheckout(token: string) {
    if (!session) return;
    setSpinOpen(false);
    setCheckingOut(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
      const res = await fetch(`${API_URL}/api/orders/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ eventId, items, freeSpinToken: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Free checkout failed");
      Alert.alert("🎉 Free tickets claimed!", "Your tickets are confirmed. Check My Tickets.");
      router.replace("/(app)/(tabs)/tickets" as never);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setCheckingOut(false);
    }
  }

  async function proceed() {
    if (!hasItems || !session) return;
    // Onboarding gate — collect name/email/billing before the first purchase.
    if (!billingComplete(profile)) {
      setOnboardingOpen(true);
      return;
    }
    await checkout();
  }

  async function checkout() {
    if (!session) return;
    setCheckingOut(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

      // 1. Create a PaymentIntent + ephemeral key on the server.
      const res = await fetch(`${API_URL}/api/orders/payment-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId, items,
          promoCode: promoCode || undefined,
          creditsToApply: redeemCredits > 0 ? redeemCredits : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentIntent) throw new Error(data.error ?? "Checkout failed");

      // 2. Re-initialise Stripe with the publishable key returned by the server.
      //    This ensures the key always matches the account that created the
      //    PaymentIntent — critical when the Stripe account changes without a
      //    mobile rebuild (e.g. switching from UK → HU account).
      if (data.publishableKey) {
        await initStripe({
          publishableKey: data.publishableKey,
          merchantIdentifier: "merchant.com.eventos.mobile",
        });
      }

      // 3. Initialise the native PaymentSheet.
      const init = await initPaymentSheet({
        merchantDisplayName: event?.name ?? "EventOS",
        customerId: data.customer,
        customerEphemeralKeySecret: data.ephemeralKey,
        paymentIntentClientSecret: data.paymentIntent,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: {
          name: profile?.billing_name ?? profile?.name ?? undefined,
          email: profile?.email ?? undefined,
        },
      });
      if (init.error) throw new Error(init.error.message);

      // 4. Present it. Tickets are created by the payment_intent.succeeded webhook.
      const { error } = await presentPaymentSheet();
      if (error) {
        if (error.code === "Canceled") return; // user dismissed — no-op
        throw new Error(error.message);
      }

      // Credits: server awards a flat amount per paid order (NOT per ticket).
      const { data: cs } = await (supabase as any)
        .from("app_settings").select("credits_per_ticket").eq("id", "global").single();
      const creditsEarned = cs?.credits_per_ticket ?? 4;

      Alert.alert(
        "🎉 Payment successful!",
        `Your tickets are on the way.\n\n⭐ You earned ${creditsEarned} credits!`,
      );
      router.replace("/(app)/(tabs)/tickets" as never);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#fafafa" />
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4" style={{ paddingTop: insets.top }}>
        <Text className="text-foreground text-lg">Event not found</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-1">
          <ChevronLeft size={16} color="#fafafa" strokeWidth={1.75} />
          <Text className="text-foreground">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 gap-3">
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-0.5">
          <ChevronLeft size={18} color="#fafafa" strokeWidth={1.75} />
          <Text className="text-foreground text-base">Back</Text>
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1 tracking-tight" numberOfLines={1}>
          {event.name}
        </Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Event meta */}
        <View className="gap-1.5 mb-5">
          <View className="flex-row items-center gap-1.5">
            <CalendarDays size={14} color="#8f8f8f" strokeWidth={1.75} />
            <Text className="text-muted-foreground text-sm">{formatDate(event.start_date)}</Text>
          </View>
          {event.venue && (
            <View className="flex-row items-center gap-1.5">
              <MapPin size={14} color="#8f8f8f" strokeWidth={1.75} />
              <Text className="text-muted-foreground text-sm">{event.venue}</Text>
            </View>
          )}
        </View>

        {/* Ticket types */}
        <View className="gap-3">
          {ticketTypes.map((t) => {
            const available = t.quantity - t.sold;
            const soldOut = available <= 0;
            const qty = quantities[t.id] ?? 0;
            const max = Math.min(available, t.max_per_order);
            return (
              <Card key={t.id}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <View className="flex-row flex-wrap items-center gap-1.5 mb-1">
                      <Text className="text-foreground font-semibold text-base tracking-tight">{t.name}</Text>
                      <Badge label={t.tier} variant="secondary" />
                      {t.is_bundle && <Badge label={`Bundle ×${t.bundle_size}`} variant="muted" />}
                      {soldOut && <Badge label="Sold out" variant="destructive" />}
                    </View>
                    {t.description && <Text className="text-muted-foreground text-sm">{t.description}</Text>}
                    <Text className="text-foreground font-semibold mt-1">
                      {t.price === 0 ? "Free" : fmt(priceOf(t))}
                    </Text>
                  </View>
                  {!soldOut && (
                    <View className="flex-row items-center gap-2">
                      <Button variant="outline" size="icon" onPress={() => updateQty(t, -1)} disabled={qty === 0}>
                        <Minus size={14} color="#fafafa" strokeWidth={2} />
                      </Button>
                      <Text className="text-foreground w-5 text-center font-medium">{qty}</Text>
                      <Button variant="outline" size="icon" onPress={() => updateQty(t, 1)} disabled={qty >= max}>
                        <Plus size={14} color="#fafafa" strokeWidth={2} />
                      </Button>
                    </View>
                  )}
                </View>
              </Card>
            );
          })}
        </View>

        {/* Promo code — disabled while redeeming credits (either-or) */}
        <View className="mt-4">
          <Input
            label="Promo code"
            value={promoCode}
            onChangeText={(v) => setPromoCode(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder={redeemCredits > 0 ? "Using credits" : "Optional"}
            editable={redeemCredits === 0}
          />
        </View>
      </ScrollView>

      {/* Sticky footer */}
      {hasItems && (
        <View className="px-5 pt-3 border-t border-border" style={{ paddingBottom: insets.bottom + 12 }}>
          {/* Subtotal */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-muted-foreground">Subtotal</Text>
            <Text className={`font-bold text-lg ${freeToken || redeemCredits > 0 ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {fmt(subtotal)}
            </Text>
          </View>

          {/* Credit redemption — slider (matches web), no promo, redemption enabled */}
          {!freeToken && !promoActive && redeemMax > 0 && (
            <View
              className="rounded-xl border px-3 py-3 mb-3"
              style={{ borderColor: "rgba(235,224,90,0.4)", backgroundColor: "rgba(235,224,90,0.06)" }}
            >
              <View className="flex-row items-center gap-2">
                <Wallet size={16} color="#EBE05A" strokeWidth={2} />
                <Text className="font-semibold text-sm text-foreground">Use credits</Text>
                <Text className="ml-auto text-xs text-muted-foreground">Balance: {redeemMax}</Text>
              </View>
              <View className="mt-3">
                <Slider value={redeemCredits} min={0} max={redeemMax} step={1} onChange={setRedeemCredits} />
              </View>
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-xs text-muted-foreground">{redeemCredits} credits</Text>
                <Text className="text-xs font-semibold" style={{ color: "#EBE05A" }}>
                  −{fmt(redeemDiscount)} off
                </Text>
              </View>
            </View>
          )}

          {/* Free spin banner — only when cart meets spin conditions + enough credits */}
          {spinEligible && !freeToken && (
            <Pressable
              onPress={() => { setSpinResult(null); setSpinOpen(true); }}
              className="flex-row items-center justify-between rounded-xl border px-3 py-2.5 mb-3 active:opacity-75"
              style={{ borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)" }}
            >
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color="#f59e0b" strokeWidth={2} />
                <Text className="font-semibold text-sm" style={{ color: "#f59e0b" }}>
                  Roll the dice — win free tickets!
                </Text>
                <Text className="text-xs text-muted-foreground">costs {spinCost} credits</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Star size={12} color="#f59e0b" strokeWidth={2} fill="#f59e0b" />
                <Text className="text-xs font-semibold" style={{ color: "#f59e0b" }}>{credits}</Text>
              </View>
            </Pressable>
          )}

          {/* Checkout or free claim */}
          {freeToken ? (
            <SlideToConfirm
              label="🎟 Slide to claim free tickets"
              confirmedLabel="Claiming…"
              color="#f59e0b"
              disabled={checkingOut}
              onConfirm={() => freeCheckout(freeToken)}
              icon={<Sparkles size={22} color="#000" strokeWidth={2} />}
            />
          ) : (
            <SlideToConfirm
              label={`Slide to checkout · ${fmt(displayTotal)}`}
              color="#EBE05A"
              onColor="#323000"
              lockOnConfirm={false}
              disabled={checkingOut}
              onConfirm={proceed}
              icon={<Tag size={22} color="#323000" strokeWidth={2} />}
            />
          )}
        </View>
      )}

      <OnboardingModal
        visible={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => { setOnboardingOpen(false); void checkout(); }}
      />

      <SpinModal
        visible={spinOpen}
        balance={credits}
        spinCost={spinCost}
        result={spinResult}
        spinning={spinning}
        onSpin={doSpin}
        onClose={() => setSpinOpen(false)}
        onClaim={(token) => { setSpinOpen(false); void freeCheckout(token); }}
      />
    </View>
  );
}
