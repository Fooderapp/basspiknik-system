import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStripe } from "@stripe/stripe-react-native";
import { ChevronLeft, Minus, Plus, Tag, CalendarDays, MapPin } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { OnboardingModal } from "@/components/OnboardingModal";
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

      Alert.alert("Payment successful", "Your tickets are on the way.");
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
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-muted-foreground">Subtotal</Text>
            <Text className="text-foreground font-bold text-lg">{fmt(subtotal)}</Text>
          </View>
          <Button onPress={proceed} loading={checkingOut} icon={<Tag size={16} color="#000" strokeWidth={2} />}>
            <Text className="font-semibold">Checkout · {fmt(subtotal)}</Text>
          </Button>
        </View>
      )}

      <OnboardingModal
        visible={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => { setOnboardingOpen(false); void checkout(); }}
      />
    </View>
  );
}
