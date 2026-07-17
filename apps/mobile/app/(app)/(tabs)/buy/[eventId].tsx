import { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStripe, initStripe } from "@stripe/stripe-react-native";
import { ChevronLeft, Minus, Plus, Tag, CalendarDays, MapPin, Sparkles, Star, Wallet } from "lucide-react-native";
import { Slider } from "@/components/ui/Slider";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { useLanguage } from "@/context/language";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { OnboardingModal } from "@/components/OnboardingModal";
import { SpinModal } from "@/components/SpinModal";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Event, TicketType } from "@/lib/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Brand tokens
const INK  = "#16170F";
const LIME = "#C7E04A";

function billingComplete(p: { billing_name?: string | null; billing_address?: string | null; billing_city?: string | null; billing_postal_code?: string | null; onboarded_at?: string | null } | null): boolean {
  if (!p) return false;
  return !!(p.onboarded_at && p.billing_name && p.billing_address && p.billing_city && p.billing_postal_code);
}

export default function BuyEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { dict } = useLanguage();
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
  const [credits, setCredits]         = useState(0);
  const [spinCost, setSpinCost]       = useState(4);
  const [spinEnabled, setSpinEnabled] = useState(false);
  const [spinOpen, setSpinOpen]       = useState(false);
  const [spinning, setSpinning]       = useState(false);
  const [spinResult, setSpinResult]   = useState<{ win: boolean; token?: string; balance?: number } | null>(null);
  const [freeToken, setFreeToken]     = useState<string | null>(null);
  const [spinEligible, setSpinEligible] = useState(false);

  // Credit redemption
  const [redeemMax, setRedeemMax]         = useState(0);
  const [redeemValue, setRedeemValue]     = useState(0);
  const [redeemCredits, setRedeemCredits] = useState(0);

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
    } catch { /* silent */ }
  }, [session]);

  useEffect(() => {
    (async () => {
      const [{ data: ev }, { data: settings }] = await Promise.all([
        (supabase as any).from("events").select("*, ticket_types(*)").eq("id", eventId).in("status", ["PUBLISHED", "PREORDER"]).single(),
        (supabase as any).from("app_settings").select("currency").single(),
      ]);
      if (ev) {
        setEvent(ev as Event);
        const now = Date.now();
        setTicketTypes(((ev.ticket_types as TicketType[]) ?? []).filter((tt) => {
          const ta = tt as any;
          if (ta.is_door_ticket || ta.is_vip_ticket) return false;
          if (ta.is_visible === false) return false;
          if (ta.visible_until && new Date(ta.visible_until).getTime() < now) return false;
          return true;
        }));
      }
      if (settings?.currency) setCurrency(settings.currency);
      await fetchCredits();
      setLoading(false);
    })();
  }, [eventId, fetchCredits]);

  useFocusEffect(useCallback(() => { void fetchCredits(); }, [fetchCredits]));

  useEffect(() => {
    if (!session || !spinEnabled) { setSpinEligible(false); return; }
    const items = Object.entries(quantities).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    if (items.length === 0) { setSpinEligible(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
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
    return () => { cancelled = true; clearTimeout(timer); };
  }, [quantities, spinEnabled, session, eventId]);

  const fmt = (n: number) => formatCurrency(n, currency);
  const priceOf = (tt: TicketType) => (tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price);
  const subtotal = ticketTypes.reduce((s, tt) => s + (quantities[tt.id] ?? 0) * priceOf(tt), 0);
  const hasItems = Object.values(quantities).some((q) => q > 0);

  const promoActive = !!promoCode.trim();
  const redeemDiscount = redeemCredits * redeemValue;
  const displayTotal = Math.max(0, subtotal - redeemDiscount);

  useEffect(() => {
    if (!session || promoActive || subtotal <= 0) {
      setRedeemMax(0); setRedeemValue(0); setRedeemCredits(0);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
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
    return () => { cancelled = true; clearTimeout(timer); };
  }, [subtotal, promoActive, session]);

  function updateQty(tt: TicketType, delta: number) {
    const max = Math.min(tt.quantity - tt.sold, tt.max_per_order);
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(max, (prev[tt.id] ?? 0) + delta));
      return { ...prev, [tt.id]: next };
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
      if (!res.ok) { Alert.alert(dict["common.error"], data.error ?? dict["common.retry"]); return; }
      setSpinResult({ win: !!data.win, token: data.token, balance: data.balance });
      setCredits(data.balance ?? credits);
      if (data.win && data.token) setFreeToken(data.token);
    } catch (e: any) {
      Alert.alert(dict["common.error"], e.message);
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
      if (!res.ok) throw new Error(data.error ?? dict["event.checkout_failed"]);
      Alert.alert(dict["event.free_claimed"], dict["event.free_claimed_body"]);
      router.replace("/(app)/(tabs)/tickets" as never);
    } catch (e: any) {
      Alert.alert(dict["common.error"], e.message);
    } finally {
      setCheckingOut(false);
    }
  }

  async function proceed() {
    if (!hasItems || !session) return;
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

      const res = await fetch(`${API_URL}/api/orders/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          eventId, items,
          promoCode: promoCode || undefined,
          creditsToApply: redeemCredits > 0 ? redeemCredits : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentIntent) throw new Error(data.error ?? dict["event.checkout_failed"]);

      if (data.publishableKey) {
        await initStripe({
          publishableKey: data.publishableKey,
          merchantIdentifier: "merchant.com.eventos.mobile",
        });
      }

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

      const { error } = await presentPaymentSheet();
      if (error) {
        if (error.code === "Canceled") return;
        throw new Error(error.message);
      }

      const { data: cs } = await (supabase as any)
        .from("app_settings").select("credits_per_ticket").eq("id", "global").single();
      const creditsEarned = cs?.credits_per_ticket ?? 4;

      Alert.alert(
        dict["event.success_title"],
        t(dict, "event.success_body", { n: creditsEarned }),
      );
      router.replace("/(app)/(tabs)/tickets" as never);
    } catch (e: any) {
      Alert.alert(dict["common.error"], e.message ?? dict["event.checkout_failed"]);
    } finally {
      setCheckingOut(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={INK} />
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4" style={{ paddingTop: insets.top }}>
        <Text className="text-foreground text-lg">{dict["event.not_found"]}</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-1">
          <ChevronLeft size={16} color={INK} strokeWidth={1.75} />
          <Text className="text-foreground">{dict["event.go_back"]}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 gap-3">
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-0.5">
          <ChevronLeft size={18} color={INK} strokeWidth={1.75} />
          <Text className="text-foreground text-base">{dict["event.back"]}</Text>
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1 tracking-tight" numberOfLines={1}>
          {event.name}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Cover image */}
        {event.cover_image_url && (
          <View style={{ marginHorizontal: 20, marginBottom: 20, borderRadius: 24, overflow: "hidden", aspectRatio: 16 / 9 }}>
            <Image
              source={{ uri: event.cover_image_url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          </View>
        )}

        <View className="px-5">
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
            {(event as any).description && (
              <Text className="text-muted-foreground text-sm mt-1">{(event as any).description}</Text>
            )}
          </View>

          {/* Section label — matches web's green uppercase label */}
          <Text style={{ color: "#3C7A1E", fontSize: 10, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            {dict["buy.title"]}
          </Text>

          {/* PREORDER: tickets not on sale yet — mirror web "coming soon" state */}
          {(event as any).status === "PREORDER" ? (
            <View style={{ borderRadius: 24, backgroundColor: INK, padding: 24, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: LIME, marginBottom: 4 }}>
                <CalendarDays size={22} color={INK} strokeWidth={2} />
              </View>
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" }}>
                {dict["buy.preorder_title"]}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
                {dict["buy.preorder_sub"]}
              </Text>
            </View>
          ) : (
          /* Ticket types */
          <View className="gap-3">
            {ticketTypes.map((tt) => {
              const ta = tt as any;
              const comingSoon = !!(ta.visible_from && new Date(ta.visible_from).getTime() > Date.now());
              const available = tt.quantity - tt.sold;
              const soldOut = !comingSoon && available <= 0;
              const qty = quantities[tt.id] ?? 0;
              const selected = qty > 0 && !soldOut && !comingSoon;
              const max = Math.min(available, tt.max_per_order);
              return (
                <View
                  key={tt.id}
                  style={{
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: selected ? "#9FE870" : "transparent",
                    backgroundColor: "#F0EEE3",
                    padding: 16,
                    opacity: comingSoon ? 0.7 : 1,
                  }}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <View className="flex-row flex-wrap items-center gap-1.5 mb-1">
                        <Text className="text-foreground font-semibold text-base tracking-tight">{tt.name}</Text>
                        <Badge label={tt.tier} variant="secondary" />
                        {tt.is_bundle && <Badge label={`Bundle ×${tt.bundle_size}`} variant="muted" />}
                        {soldOut && <Badge label={dict["buy.sold_out"]} variant="destructive" />}
                        {comingSoon && <Badge label={dict["buy.coming_soon"]} variant="muted" />}
                      </View>
                      {tt.description && <Text className="text-muted-foreground text-sm">{tt.description}</Text>}
                      <Text className="text-foreground font-semibold mt-1">
                        {tt.price === 0 ? dict["event.free"] : fmt(priceOf(tt))}
                      </Text>
                    </View>

                    {/* Qty stepper — white pill matching web */}
                    {!soldOut && !comingSoon && (
                      <View style={{
                        flexDirection: "row", alignItems: "center", gap: 2,
                        backgroundColor: "#fff", borderRadius: 999, padding: 4,
                        shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                      }}>
                        <Pressable
                          onPress={() => updateQty(tt, -1)}
                          disabled={qty === 0}
                          style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }}
                        >
                          <Minus size={12} color={qty === 0 ? "#ccc" : INK} strokeWidth={2.5} />
                        </Pressable>
                        <Text style={{ width: 20, textAlign: "center", fontSize: 14, fontWeight: "700", color: INK }}>{qty}</Text>
                        <Pressable
                          onPress={() => updateQty(tt, 1)}
                          disabled={qty >= max}
                          style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }}
                        >
                          <Plus size={12} color={qty >= max ? "#ccc" : INK} strokeWidth={2.5} />
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          )}
        </View>
      </ScrollView>

      {/* Floating subtotal card — matches web's sticky rounded-[2.25rem] summary */}
      {hasItems && (
        <View style={{
          marginHorizontal: 16,
          marginBottom: insets.bottom + 8,
          borderRadius: 36,
          padding: 16,
          backgroundColor: "#E5E5E5",
          shadowColor: INK,
          shadowOpacity: 0.14,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
          gap: 12,
        }}>
          {/* Total row */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ color: "#6B6F63", fontSize: 10, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" }}>
              {dict["event.subtotal"]}
            </Text>
            <Text style={{
              fontSize: 20, fontWeight: "800", color: INK,
              textDecorationLine: freeToken ? "line-through" : "none",
              opacity: freeToken ? 0.5 : 1,
            }}>
              {fmt(subtotal)}
            </Text>
          </View>

          {/* Credit redemption slider */}
          {!freeToken && !promoActive && redeemMax > 0 && (
            <View style={{ borderRadius: 16, backgroundColor: "#D8D6C8", padding: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Wallet size={16} color="#163300" strokeWidth={2} />
                <Text style={{ fontWeight: "700", fontSize: 13, color: INK, flex: 1 }}>{dict["event.use_credits"]}</Text>
                <View style={{ backgroundColor: "#F6F5EE", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: "#404040", fontSize: 11, fontWeight: "600" }}>
                    {t(dict, "event.balance", { n: redeemMax })}
                  </Text>
                </View>
              </View>
              <Slider value={redeemCredits} min={0} max={redeemMax} step={1} onChange={setRedeemCredits} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: "#6B6F63" }}>{redeemCredits} credits</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#163300" }}>
                  −{fmt(redeemDiscount)} off
                </Text>
              </View>
            </View>
          )}

          {/* Spin banner */}
          {spinEligible && !freeToken && (
            <Pressable
              onPress={() => { setSpinResult(null); setSpinOpen(true); }}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                borderRadius: 16, borderWidth: 1, borderColor: "#f59e0b",
                backgroundColor: "rgba(245,158,11,0.08)", paddingHorizontal: 12, paddingVertical: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Sparkles size={16} color="#f59e0b" strokeWidth={2} />
                <Text style={{ fontWeight: "600", fontSize: 13, color: "#f59e0b" }}>
                  {dict["event.spin_banner"]}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Star size={12} color="#f59e0b" strokeWidth={2} fill="#f59e0b" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#f59e0b" }}>{credits}</Text>
              </View>
            </Pressable>
          )}

          {/* Checkout slider */}
          {freeToken ? (
            <SlideToConfirm
              label={dict["event.spin_slide"]}
              confirmedLabel={dict["event.spin_claiming"]}
              color="#f59e0b"
              disabled={checkingOut}
              onConfirm={() => freeCheckout(freeToken)}
              icon={<Sparkles size={22} color="#000" strokeWidth={2} />}
            />
          ) : (
            <SlideToConfirm
              label={t(dict, "event.slide_checkout", { price: fmt(displayTotal) })}
              color={LIME}
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
