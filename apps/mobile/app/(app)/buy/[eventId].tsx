import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStripe } from "@stripe/stripe-react-native";
import { ChevronLeft, Minus, Plus, Tag, CalendarDays, MapPin, Sparkles, Star } from "lucide-react-native";
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

function billingComplete(p: { billing_address?: string | null; billing_city?: string | null; billing_postal_code?: string | null; onboarded_at?: string | null } | null): boolean {
  if (!p) return false;
  return !!(p.onboarded_at && p.billing_address && p.billing_city && p.billing_postal_code);
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

  useEffect(() => {
    (async () => {
      const [{ data: ev }, { data: settings }, creditRes] = await Promise.all([
        (supabase as any).from("events").select("*, ticket_types(*)").eq("id", eventId).eq("status", "PUBLISHED").single(),
        (supabase as any).from("app_settings").select("currency").single(),
        session ? fetch(`${API_URL}/api/credits/balance`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then(r => r.json()).catch(() => null) : Promise.resolve(null),
      ]);
      if (ev) {
        setEvent(ev as Event);
        // Door tickets are POS-only — never sold in-app.
        setTicketTypes(((ev.ticket_types as TicketType[]) ?? []).filter((t) => !(t as any).is_door_ticket));
      }
      if (settings?.currency) setCurrency(settings.currency);
      if (creditRes) {
        setCredits(creditRes.balance ?? 0);
        setSpinCost(creditRes.spinCost ?? 4);
        setSpinEnabled(creditRes.enabled ?? false);
      }
      setLoading(false);
    })();
  }, [eventId]);

  const fmt = (n: number) => formatCurrency(n, currency);
  const priceOf = (t: TicketType) => (t.sale_enabled && t.sale_price != null ? t.sale_price : t.price);
  const subtotal = ticketTypes.reduce((s, t) => s + (quantities[t.id] ?? 0) * priceOf(t), 0);
  const hasItems = Object.values(quantities).some((q) => q > 0);

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
      router.replace("/(app)/tickets");
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
        body: JSON.stringify({ eventId, items, promoCode: promoCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentIntent) throw new Error(data.error ?? "Checkout failed");

      // 2. Initialise the native PaymentSheet.
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

      // 3. Present it. Tickets are created by the payment_intent.succeeded webhook.
      const { error } = await presentPaymentSheet();
      if (error) {
        if (error.code === "Canceled") return; // user dismissed — no-op
        throw new Error(error.message);
      }

      // Estimate credits earned (server awards them via webhook asynchronously)
      const { data: cs } = await (supabase as any)
        .from("app_settings").select("credits_per_ticket").eq("id", "global").single();
      const creditsPerTicket = cs?.credits_per_ticket ?? 4;
      const totalTicketsBought = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .reduce((acc, [id, qty]) => {
          const tt = ticketTypes.find(t => t.id === id);
          return acc + qty * (tt?.is_bundle && tt?.bundle_size ? tt.bundle_size : 1);
        }, 0);
      const creditsEarned = totalTicketsBought * creditsPerTicket;

      Alert.alert(
        "🎉 Payment successful!",
        `Your tickets are on the way.\n\n⭐ You earned ${creditsEarned} credits!`,
      );
      router.replace("/(app)/tickets");
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

        {/* Promo code */}
        <View className="mt-4">
          <Input
            label="Promo code"
            value={promoCode}
            onChangeText={(v) => setPromoCode(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="Optional"
          />
        </View>
      </ScrollView>

      {/* Sticky footer */}
      {hasItems && (
        <View className="px-5 pt-3 border-t border-border" style={{ paddingBottom: insets.bottom + 12 }}>
          {/* Subtotal */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-muted-foreground">Subtotal</Text>
            <Text className={`font-bold text-lg ${freeToken ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {fmt(subtotal)}
            </Text>
          </View>

          {/* Free spin banner — shows when credits enabled + user has enough */}
          {spinEnabled && !freeToken && credits >= spinCost && (
            <Pressable
              onPress={() => { setSpinResult(null); setSpinOpen(true); }}
              className="flex-row items-center justify-between rounded-xl border px-3 py-2.5 mb-3 active:opacity-75"
              style={{ borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)" }}
            >
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color="#f59e0b" strokeWidth={2} />
                <Text className="font-semibold text-sm" style={{ color: "#f59e0b" }}>
                  Try free spin!
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
              label={`Slide to checkout · ${fmt(subtotal)}`}
              color="#fafafa"
              onColor="#000000"
              lockOnConfirm={false}
              disabled={checkingOut}
              onConfirm={proceed}
              icon={<Tag size={22} color="#000" strokeWidth={2} />}
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
