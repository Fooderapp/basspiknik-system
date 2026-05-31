import { useState, useEffect, useCallback } from "react";
import {
  View, FlatList, ActivityIndicator, ScrollView,
  Modal, Alert, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useStripeTerminal,
  DiscoveryMethod,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import type { TicketType, Event } from "@/lib/types";

interface CartItem { ticketType: TicketType; quantity: number }
type PaymentMethod = "cash" | "tap";
type TapState = "idle" | "discovering" | "connecting" | "ready" | "processing" | "success" | "error";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function SellerScreen() {
  const insets = useSafeAreaInsets();

  // ── Data state ──
  const [events, setEvents]               = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes]     = useState<TicketType[]>([]);
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [buyerName, setBuyerName]         = useState("");
  const [buyerEmail, setBuyerEmail]       = useState("");
  const [loading, setLoading]             = useState(true);
  const [selling, setSelling]             = useState(false);
  const [confirmOpen, setConfirmOpen]     = useState(false);
  const [successInfo, setSuccessInfo]     = useState<{ total: number; ticketCount: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // ── Stripe Terminal state ──
  const [tapState, setTapState]   = useState<TapState>("idle");
  const [tapMessage, setTapMessage] = useState("");
  const [connectedReader, setConnectedReader] = useState<Reader | null>(null);

  const {
    initialize,
    discoverReaders,
    cancelDiscovering,
    connectLocalMobileReader,
    createPaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    connectedReader: stripeReader,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: useCallback(async (readers: Reader[]) => {
      if (readers.length === 0) return;
      // Auto-connect to first discovered reader (local mobile = this iPhone)
      setTapState("connecting");
      setTapMessage("Connecting to reader…");
      const { error } = await connectLocalMobileReader({ reader: readers[0] });
      if (error) {
        setTapState("error");
        setTapMessage(error.message);
      } else {
        setConnectedReader(readers[0]);
        setTapState("ready");
        setTapMessage("Ready to accept payment");
      }
    }, [connectLocalMobileReader]),
  });

  useEffect(() => {
    (supabase as any)
      .from("events")
      .select("*")
      .eq("status", "PUBLISHED")
      .order("start_date")
      .then(({ data }: any) => { setEvents(data ?? []); setLoading(false); });
  }, []);

  async function selectEvent(event: Event) {
    setSelectedEvent(event);
    setCart([]);
    const { data } = await (supabase as any)
      .from("ticket_types")
      .select("*")
      .eq("event_id", event.id)
      .order("price");
    setTicketTypes(data ?? []);
  }

  function addToCart(tt: TicketType) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.ticketType.id === tt.id);
      if (idx >= 0) {
        if (prev[idx].quantity >= tt.max_per_order) return prev;
        return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { ticketType: tt, quantity: 1 }];
    });
  }

  function adjustQty(ttId: string, delta: number) {
    setCart(prev => prev.flatMap(c => {
      if (c.ticketType.id !== ttId) return [c];
      const next = c.quantity + delta;
      return next <= 0 ? [] : [{ ...c, quantity: next }];
    }));
  }

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => {
    const p = i.ticketType.sale_enabled && i.ticketType.sale_price
      ? i.ticketType.sale_price : i.ticketType.price;
    return s + p * i.quantity;
  }, 0);

  // ── Initiate Tap to Pay discovery ──
  async function initTapToPay() {
    setTapState("discovering");
    setTapMessage("Looking for reader…");
    await initialize();
    const { error } = await discoverReaders({
      discoveryMethod: DiscoveryMethod.LocalMobile,
      simulated: false,
    });
    if (error) {
      setTapState("error");
      setTapMessage(error.message);
    }
  }

  // ── Cash sale ──
  async function sellCash() {
    if (cart.length === 0 || !selectedEvent) return;
    setSelling(true);
    try {
      const { data, error } = await supabase.rpc("sell_tickets_cash", {
        p_event_id:    selectedEvent.id,
        p_buyer_name:  buyerName.trim() || null,
        p_buyer_email: buyerEmail.trim() || null,
        p_items: cart.map(c => ({ ticketTypeId: c.ticketType.id, quantity: c.quantity })),
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setSuccessInfo({ total: data.total, ticketCount: data.ticketCount });
      setCart([]); setBuyerName(""); setBuyerEmail(""); setConfirmOpen(false);
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSelling(false); }
  }

  // ── Tap to Pay sale ──
  async function sellTap() {
    if (cart.length === 0 || !selectedEvent) return;
    if (tapState !== "ready") {
      Alert.alert("Reader not ready", "Connect Tap to Pay reader first.");
      return;
    }
    setSelling(true);
    setTapState("processing");
    setTapMessage("Processing payment…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // 1. Create payment intent on backend
      const res = await fetch(`${API_URL}/api/terminal/payment-intent`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(cartTotal * 100), // cents
          currency: "eur",
          metadata: {
            event_id: selectedEvent.id,
            buyer_name: buyerName.trim() || null,
          },
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const { clientSecret } = await res.json();

      // 2. Collect payment
      setTapMessage("Hold card near iPhone…");
      const { paymentIntent, error: collectError } = await collectPaymentMethod({ paymentIntentClientSecret: clientSecret });
      if (collectError) throw new Error(collectError.message);
      if (!paymentIntent) throw new Error("No payment intent returned");

      // 3. Confirm payment
      setTapMessage("Confirming…");
      const { error: confirmError } = await confirmPaymentIntent({ paymentIntent });
      if (confirmError) throw new Error(confirmError.message);

      // 4. Issue tickets via RPC
      const { data, error: rpcError } = await supabase.rpc("sell_tickets_cash", {
        p_event_id:    selectedEvent.id,
        p_buyer_name:  buyerName.trim() || null,
        p_buyer_email: buyerEmail.trim() || null,
        p_items: cart.map(c => ({ ticketTypeId: c.ticketType.id, quantity: c.quantity })),
      });
      if (rpcError) throw new Error(rpcError.message);
      if (data?.error) throw new Error(data.error);

      setTapState("success");
      setTapMessage("Payment accepted!");
      setSuccessInfo({ total: data.total, ticketCount: data.ticketCount });
      setCart([]); setBuyerName(""); setBuyerEmail(""); setConfirmOpen(false);
    } catch (e: any) {
      setTapState("ready");
      setTapMessage("Ready to accept payment");
      Alert.alert("Payment failed", e.message);
    } finally {
      setSelling(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  // ── Event selection ──────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 pt-4 pb-3">
          <Text className="text-foreground text-2xl font-bold">💳 Sell Tickets</Text>
          <Text className="text-muted-foreground text-sm">Select an event</Text>
        </View>
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-5xl mb-3">🎪</Text>
              <Text className="text-muted-foreground">No published events</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Button
              variant="outline"
              className="mb-3 h-auto py-4 px-4 items-start"
              onPress={() => selectEvent(item)}
            >
              <View className="w-full">
                <Text className="text-foreground font-bold text-base">{item.name}</Text>
                {item.venue && <Text className="text-muted-foreground text-sm mt-0.5">📍 {item.venue}</Text>}
                <Text className="text-muted-foreground text-sm mt-0.5">📅 {formatDate(item.start_date)}</Text>
              </View>
            </Button>
          )}
        />
      </View>
    );
  }

  // ── POS screen ───────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-1 mr-3">
          <Button variant="ghost" size="sm" className="self-start px-0" onPress={() => setSelectedEvent(null)}>
            <Text className="text-primary text-sm">← Events</Text>
          </Button>
          <Text className="text-foreground font-bold text-lg" numberOfLines={1}>
            {selectedEvent.name}
          </Text>
        </View>
        {cartCount > 0 && (
          <Button onPress={() => setConfirmOpen(true)} size="sm">
            <Text>{cartCount} · {formatCurrency(cartTotal)}</Text>
          </Button>
        )}
      </View>

      {/* Tap to Pay status bar */}
      {tapState !== "idle" && (
        <View className={`mx-5 mb-2 px-4 py-2.5 rounded-xl flex-row items-center gap-2 ${
          tapState === "ready" || tapState === "success" ? "bg-success/10 border border-success/30"
          : tapState === "error" ? "bg-destructive/10 border border-destructive/30"
          : "bg-card border border-border"
        }`}>
          {(tapState === "discovering" || tapState === "connecting" || tapState === "processing") && (
            <ActivityIndicator size="small" color="#7c3aed" />
          )}
          <Text className={`text-sm ${
            tapState === "ready" || tapState === "success" ? "text-success-foreground"
            : tapState === "error" ? "text-destructive"
            : "text-muted-foreground"
          }`}>
            {tapState === "ready" || tapState === "success" ? "✓ " : ""}{tapMessage}
          </Text>
        </View>
      )}

      {/* Ticket types */}
      <FlatList
        data={ticketTypes}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">🎟️</Text>
            <Text className="text-muted-foreground">No ticket types for this event</Text>
          </View>
        }
        renderItem={({ item: tt }) => {
          const price     = tt.sale_enabled && tt.sale_price ? tt.sale_price : tt.price;
          const qty       = cart.find(c => c.ticketType.id === tt.id)?.quantity ?? 0;
          const available = tt.quantity - tt.sold;
          return (
            <Card className="mb-3">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 mr-3">
                  <CardTitle>{tt.name}</CardTitle>
                  {tt.description && <CardDescription numberOfLines={2}>{tt.description}</CardDescription>}
                  <Text className="text-muted-foreground text-xs mt-1">
                    {available} available · {tt.tier}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-foreground font-bold text-xl">{formatCurrency(price)}</Text>
                  {tt.sale_enabled && tt.sale_price && (
                    <Text className="text-muted-foreground text-xs line-through">{formatCurrency(tt.price)}</Text>
                  )}
                </View>
              </View>
              <View className="flex-row justify-end">
                {qty === 0 ? (
                  <Button
                    variant={available > 0 ? "default" : "secondary"}
                    size="sm"
                    disabled={available === 0}
                    onPress={() => addToCart(tt)}
                  >
                    <Text>{available > 0 ? "+ Add" : "Sold out"}</Text>
                  </Button>
                ) : (
                  <View className="flex-row items-center gap-4 bg-secondary rounded-xl px-4 py-2.5">
                    <Button variant="ghost" size="icon" onPress={() => adjustQty(tt.id, -1)}>
                      <Text className="text-foreground font-bold text-xl">−</Text>
                    </Button>
                    <Text className="text-foreground font-bold text-base w-5 text-center">{qty}</Text>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={qty >= tt.max_per_order}
                      onPress={() => adjustQty(tt.id, 1)}
                    >
                      <Text className={qty >= tt.max_per_order ? "text-muted-foreground font-bold text-xl" : "text-foreground font-bold text-xl"}>+</Text>
                    </Button>
                  </View>
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Checkout modal */}
      <Modal visible={confirmOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setConfirmOpen(false)}>
        <View className="flex-1 bg-background px-5 pt-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-foreground text-xl font-bold">Confirm Sale</Text>
            <Button variant="ghost" size="sm" onPress={() => setConfirmOpen(false)}>
              <Text className="text-muted-foreground">Cancel</Text>
            </Button>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {/* Order summary */}
            {cart.map(item => {
              const p = item.ticketType.sale_enabled && item.ticketType.sale_price
                ? item.ticketType.sale_price : item.ticketType.price;
              return (
                <View key={item.ticketType.id} className="flex-row justify-between py-3 border-b border-border">
                  <Text className="text-foreground">{item.ticketType.name} × {item.quantity}</Text>
                  <Text className="text-foreground font-semibold">{formatCurrency(p * item.quantity)}</Text>
                </View>
              );
            })}

            <View className="flex-row justify-between py-4 mb-4">
              <Text className="text-foreground font-bold text-lg">Total</Text>
              <Text className="text-foreground font-bold text-lg">{formatCurrency(cartTotal)}</Text>
            </View>

            {/* Buyer info */}
            <View className="gap-3 mb-6">
              <Input
                placeholder="Buyer name (optional)"
                value={buyerName}
                onChangeText={setBuyerName}
              />
              <Input
                placeholder="Buyer email (optional)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={buyerEmail}
                onChangeText={setBuyerEmail}
              />
            </View>

            {/* Payment method selector */}
            <Text className="text-muted-foreground text-xs font-semibold mb-2 uppercase tracking-wide">
              Payment Method
            </Text>
            <View className="flex-row gap-2 mb-4">
              <Pressable
                onPress={() => setPaymentMethod("cash")}
                className={`flex-1 py-3 rounded-xl border items-center active:opacity-70 ${
                  paymentMethod === "cash"
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Text className={`font-semibold ${paymentMethod === "cash" ? "text-white" : "text-foreground"}`}>
                  💵 Cash
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPaymentMethod("tap");
                  if (tapState === "idle") initTapToPay();
                }}
                className={`flex-1 py-3 rounded-xl border items-center active:opacity-70 ${
                  paymentMethod === "tap"
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Text className={`font-semibold ${paymentMethod === "tap" ? "text-white" : "text-foreground"}`}>
                  📱 Tap to Pay
                </Text>
              </Pressable>
            </View>

            {/* Tap to Pay status in modal */}
            {paymentMethod === "tap" && tapState !== "idle" && (
              <View className={`px-4 py-3 rounded-xl mb-4 ${
                tapState === "ready" ? "bg-success/10 border border-success/30"
                : tapState === "error" ? "bg-destructive/10 border border-destructive/30"
                : "bg-card border border-border"
              }`}>
                <View className="flex-row items-center gap-2">
                  {(tapState === "discovering" || tapState === "connecting") && (
                    <ActivityIndicator size="small" color="#7c3aed" />
                  )}
                  <Text className={`text-sm ${
                    tapState === "ready" ? "text-success-foreground"
                    : tapState === "error" ? "text-destructive"
                    : "text-muted-foreground"
                  }`}>
                    {tapMessage}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View className="py-4 gap-3">
            {paymentMethod === "cash" ? (
              <Button variant="success" className="w-full" onPress={sellCash} loading={selling} disabled={selling}>
                <Text>💵 Collect Cash — {formatCurrency(cartTotal)}</Text>
              </Button>
            ) : (
              <Button
                variant="success"
                className="w-full"
                onPress={sellTap}
                loading={selling}
                disabled={selling || tapState !== "ready"}
              >
                <Text>📱 Charge {formatCurrency(cartTotal)} — Tap to Pay</Text>
              </Button>
            )}
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal visible={!!successInfo} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <Card className="w-full items-center p-8">
            <Text className="text-7xl mb-4">🎉</Text>
            <Text className="text-foreground text-2xl font-bold mb-1">Sold!</Text>
            <Text className="text-muted-foreground text-sm mb-6">
              {successInfo?.ticketCount} ticket{(successInfo?.ticketCount ?? 0) > 1 ? "s" : ""} issued
            </Text>
            <Text className="text-foreground font-bold text-2xl mb-8">
              {formatCurrency(successInfo?.total ?? 0)}
            </Text>
            <Button className="w-full" onPress={() => { setSuccessInfo(null); setTapState(tapState === "success" ? "ready" : tapState); }}>
              <Text>Next Customer</Text>
            </Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
