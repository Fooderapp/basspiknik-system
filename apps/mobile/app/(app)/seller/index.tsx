import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, FlatList, ActivityIndicator, ScrollView,
  Modal, Alert, Pressable, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useStripeTerminal,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import { CameraView } from "expo-camera";
import { Tent, Ticket as TicketIcon, ChevronLeft, MapPin, Calendar, Check, Banknote, Smartphone, PartyPopper, Plus, Minus, QrCode, User, UserCheck, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import type { TicketType, Event } from "@/lib/types";
import { runtimeConfig } from "@/lib/runtime-config";
import { BillingEditModal, type BillingData } from "@/components/BillingEditModal";

interface CartItem { ticketType: TicketType; quantity: number }
interface ResolvedProfile { id: string; name: string; email: string; hasBilling: boolean }
type PaymentMethod = "cash" | "tap";
type TapState = "idle" | "discovering" | "connecting" | "ready" | "processing" | "success" | "error";
type BuyerMode = "guest" | "registered";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function SellerScreen() {
  const insets = useSafeAreaInsets();

  // ── Data state ──
  const [events, setEvents]               = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes]     = useState<TicketType[]>([]);
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [buyerMode, setBuyerMode]         = useState<BuyerMode>("guest");
  const [buyerName, setBuyerName]         = useState("");
  const [buyerEmail, setBuyerEmail]       = useState("");
  const [registeredProfile, setRegisteredProfile] = useState<ResolvedProfile | null>(null);
  const [scannerOpen, setScannerOpen]     = useState(false);
  const [resolving, setResolving]         = useState(false);
  const [loading, setLoading]             = useState(true);
  const [selling, setSelling]             = useState(false);
  const [confirmOpen, setConfirmOpen]     = useState(false);
  const [successInfo, setSuccessInfo]     = useState<{ total: number; ticketCount: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const scanCooldown = useRef(false);

  // ── Stripe Terminal state ──
  const [tapState, setTapState]   = useState<TapState>("idle");
  const [tapMessage, setTapMessage] = useState("");
  const [connectedReader, setConnectedReader] = useState<Reader | null>(null);
  // Billing for guest buyers
  const [billingOpen,    setBillingOpen]    = useState(false);
  const [billingData,    setBillingData]    = useState<BillingData | null>(null);
  const [billingUserId,  setBillingUserId]  = useState<string | null>(null); // registered user whose billing is being collected
  const tapStateRef = useRef<TapState>("idle");
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationIdRef = useRef<string>("");
  useEffect(() => { tapStateRef.current = tapState; }, [tapState]);

  // Sync SDK's persisted reader connection to local state on mount / reconnect.
  // Tap to Pay uses the iPhone itself as reader — the SDK keeps it connected
  // across app restarts, so React state must reflect that immediately.
  useEffect(() => {
    if (stripeReader && tapState !== "ready" && tapState !== "processing" && tapState !== "success") {
      setConnectedReader(stripeReader as unknown as Reader | null);
      setTapState("ready");
      setTapMessage("Ready to accept payment");
    }
  }, [stripeReader]);

  const {
    initialize,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    createPaymentIntent,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    connectedReader: stripeReader,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: useCallback(async (readers: Reader.Type[]) => {
      if (readers.length === 0) return;
      setTapState("connecting");
      setTapMessage("Connecting to reader…");
      const { error } = await connectReader({
        discoveryMethod: "tapToPay",
        reader: readers[0],
        locationId: locationIdRef.current,
      });
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (error) {
        setTapState("error");
        setTapMessage(error.message);
      } else {
        setConnectedReader(readers[0]);
        setTapState("ready");
        setTapMessage("Ready to accept payment");
      }
    }, [connectReader]),
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
    // SDK already has a connected reader (persisted from previous session) — skip discovery.
    if (stripeReader) {
      setConnectedReader(stripeReader as unknown as Reader | null);
      setTapState("ready");
      setTapMessage("Ready to accept payment");
      return;
    }

    setTapState("discovering");
    setTapMessage("Looking for reader…");

    // Resolve the Stripe Terminal location ID at runtime from the backend.
    // This avoids hardcoded env vars and works when switching Stripe accounts.
    if (!locationIdRef.current) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const r = await fetch(`${API_URL}/api/terminal/location`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          });
          const d = await r.json();
          if (d?.locationId) locationIdRef.current = d.locationId;
        }
      } catch { /* fall through — Stripe SDK may use cached location */ }
    }

    // Watchdog: Tap to Pay discovery can hang forever if the connection-token
    // endpoint is unreachable or the device/network can't reach Stripe.
    // Surface a real error after 30s instead of spinning indefinitely.
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      if (tapStateRef.current === "discovering" || tapStateRef.current === "connecting") {
        setTapState("error");
        setTapMessage("Reader not found. Check internet connection, that the connection-token API is reachable, and that this iPhone supports Tap to Pay (XS or newer, iOS 16.7+).");
      }
    }, 30000);

    // initialize() is called by StripeTerminalProvider on mount.
    // Call it here too — SDK ignores duplicate inits gracefully.
    const initResult = await initialize();
    if (initResult?.error) {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      setTapState("error");
      setTapMessage(initResult.error.message ?? "SDK init failed");
      return;
    }
    const { error } = await discoverReaders({
      discoveryMethod: "tapToPay",
      simulated: runtimeConfig.stripeSimulated,
    });
    if (error) {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      // SDK reports "already connected" when a reader persisted from a previous
      // session is still active but stripeReader hadn't populated yet.
      // Treat it as ready — the useEffect will sync the reader state.
      if (error.message?.toLowerCase().includes("already connected")) {
        setTapState("ready");
        setTapMessage("Ready to accept payment");
        return;
      }
      setTapState("error");
      setTapMessage(error.message);
    }
  }

  // ── Send confirmation email after a cash/tap sale ──
  async function sendConfirmation(orderId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${API_URL}/api/seller/send-confirmation`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId }),
      });
    } catch {
      // Email failure is non-fatal — ticket is already issued
    }
  }

  // ── Resolve registered buyer from wallet QR ──
  async function resolveWalletToken(token: string) {
    if (resolving) return;
    scanCooldown.current = true;
    setResolving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_URL}/api/seller/resolve-buyer`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletToken: token }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const e = await res.json();
        Alert.alert("Not found", e.error ?? "User not found");
        return;
      }
      const resolved = await res.json();
      // Check if buyer's billing info is complete (needed for Billingo invoice)
      const hasBilling = !!(resolved.billing_address && resolved.billing_city && resolved.billing_postal_code);
      setRegisteredProfile({ ...resolved, hasBilling });
      setScannerOpen(false);
      // If billing is missing, open billing form so seller can fill it in
      if (!hasBilling) {
        setBillingUserId(resolved.id);
        setBillingOpen(true);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setResolving(false);
      setTimeout(() => { scanCooldown.current = false; }, 2000);
    }
  }

  function openScanner() {
    scanCooldown.current = false;
    setScannerOpen(true);
  }

  function resetBuyerMode(mode: BuyerMode) {
    setBuyerMode(mode);
    setRegisteredProfile(null);
    setBuyerName("");
    setBuyerEmail("");
    setBillingData(null);
    setBillingUserId(null);
  }

  const effectiveName  = buyerMode === "registered" ? (registeredProfile?.name  ?? "") : buyerName;
  const effectiveEmail = buyerMode === "registered" ? (registeredProfile?.email ?? "") : buyerEmail;
  const effectiveUserId = buyerMode === "registered" ? (registeredProfile?.id ?? null) : null;

  // ── Shared: create order + tickets via API (handles Billingo invoice) ──
  async function createPosOrder(stripePaymentIntentId?: string) {
    if (!selectedEvent) throw new Error("No event selected");
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) throw new Error("Not authenticated");

    const res = await fetch(`${API_URL}/api/seller/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authSession.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId:    selectedEvent.id,
        paymentMethod: paymentMethod === "tap" ? "TERMINAL" : "CASH",
        items: cart.map(c => {
          const p = c.ticketType.sale_enabled && c.ticketType.sale_price
            ? c.ticketType.sale_price : c.ticketType.price;
          return { ticketTypeId: c.ticketType.id, quantity: c.quantity, unitPrice: p };
        }),
        buyerName:  effectiveName  || null,
        buyerEmail: effectiveEmail || null,
        buyerUserId: effectiveUserId || null,
        billingName:    billingData?.billingName    ?? null,
        billingAddress: billingData?.billingAddress ?? null,
        billingCity:    billingData?.billingCity    ?? null,
        billingPostal:  billingData?.billingPostal  ?? null,
        billingCountry: billingData?.billingCountry ?? null,
        stripePaymentIntentId: stripePaymentIntentId ?? null,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Sale failed");
    return json as { orderId: string; totalAmount: number; totalQty: number };
  }

  // ── Cash sale ──
  async function sellCash() {
    if (cart.length === 0 || !selectedEvent) return;
    setSelling(true);
    try {
      const data = await createPosOrder();
      setSuccessInfo({ total: data.totalAmount, ticketCount: data.totalQty });
      setCart([]); setBuyerName(""); setBuyerEmail(""); setRegisteredProfile(null);
      setBillingData(null); setConfirmOpen(false);
      if (data.orderId) sendConfirmation(data.orderId);
    } catch (e: any) {
      Alert.alert("Error", e.message);
      throw e; // let SlideToConfirm spring back
    } finally { setSelling(false); }
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
          // Send display-unit amount (e.g. 5000 for 5000 HUF).
          // Backend converts to Stripe minor units via toStripeAmount() and
          // always uses the app-configured currency — never trust client currency.
          amount: cartTotal,
          metadata: {
            event_id: selectedEvent.id,
            buyer_name: buyerName.trim() || null,
          },
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const { clientSecret } = await res.json();

      // 2. Retrieve PaymentIntent object from client secret
      // SDK requires the full PaymentIntent.Type object, not the client secret string.
      const { paymentIntent: retrieved, error: retrieveError } = await retrievePaymentIntent(clientSecret);
      if (retrieveError) throw new Error(retrieveError.message);
      if (!retrieved) throw new Error("Failed to retrieve payment intent");

      // 3. Collect payment (tap card to iPhone)
      setTapMessage("Hold card near iPhone…");
      const { paymentIntent: collected, error: collectError } = await collectPaymentMethod({ paymentIntent: retrieved });
      if (collectError) throw new Error(collectError.message);
      if (!collected) throw new Error("No payment intent after collect");

      // 4. Confirm payment
      setTapMessage("Confirming…");
      const { error: confirmError } = await confirmPaymentIntent({ paymentIntent: collected });
      if (confirmError) throw new Error(confirmError.message);

      // 4. Issue tickets + Billingo invoice via API
      const data = await createPosOrder(paymentIntent.id ?? undefined);

      setTapState("success");
      setTapMessage("Payment accepted!");
      setSuccessInfo({ total: data.totalAmount, ticketCount: data.totalQty });
      setCart([]); setBuyerName(""); setBuyerEmail(""); setRegisteredProfile(null);
      setBillingData(null); setConfirmOpen(false);
      if (data.orderId) sendConfirmation(data.orderId);
    } catch (e: any) {
      setTapState("ready");
      setTapMessage("Ready to accept payment");
      Alert.alert("Payment failed", e.message);
      throw e; // let SlideToConfirm spring back so seller can retry or switch to cash
    } finally {
      setSelling(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#fafafa" />
      </View>
    );
  }

  // ── Event selection ──────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 pt-4 pb-3">
          <Text className="text-foreground text-2xl font-bold tracking-tight">Sell Tickets</Text>
          <Text className="text-muted-foreground text-sm">Select an event</Text>
        </View>
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center py-20">
              <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
                <Tent size={24} color="#8f8f8f" strokeWidth={1.75} />
              </View>
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
                <Text className="text-foreground font-bold text-base tracking-tight">{item.name}</Text>
                {item.venue && (
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <MapPin size={13} color="#8f8f8f" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-sm">{item.venue}</Text>
                  </View>
                )}
                <View className="flex-row items-center gap-1.5 mt-1">
                  <Calendar size={13} color="#8f8f8f" strokeWidth={1.75} />
                  <Text className="text-muted-foreground text-sm">{formatDate(item.start_date)}</Text>
                </View>
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
          <Button variant="ghost" size="sm" className="self-start px-0" onPress={() => setSelectedEvent(null)} icon={<ChevronLeft size={15} color="#fafafa" strokeWidth={1.75} />}>
            <Text className="text-foreground text-sm">Events</Text>
          </Button>
          <Text className="text-foreground font-bold text-lg tracking-tight" numberOfLines={1}>
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
        <View className="mx-5 mb-2 px-4 py-2.5 rounded-xl flex-row items-center gap-2 bg-card border border-border">
          {(tapState === "discovering" || tapState === "connecting" || tapState === "processing") && (
            <ActivityIndicator size="small" color="#fafafa" />
          )}
          {(tapState === "ready" || tapState === "success") && (
            <Check size={14} color="#fafafa" strokeWidth={2} />
          )}
          <Text className={`text-sm ${tapState === "error" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
            {tapMessage}
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
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
              <TicketIcon size={24} color="#8f8f8f" strokeWidth={1.75} />
            </View>
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
                    {available > 0 ? (
                      <View className="flex-row items-center gap-1.5">
                        <Plus size={15} color="#000000" strokeWidth={2.25} />
                        <Text>Add</Text>
                      </View>
                    ) : (
                      <Text>Sold out</Text>
                    )}
                  </Button>
                ) : (
                  <View className="flex-row items-center gap-4 bg-secondary border border-border rounded-xl px-4 py-2.5">
                    <Button variant="ghost" size="icon" onPress={() => adjustQty(tt.id, -1)}>
                      <Minus size={18} color="#fafafa" strokeWidth={2} />
                    </Button>
                    <Text className="text-foreground font-bold text-base w-5 text-center">{qty}</Text>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={qty >= tt.max_per_order}
                      onPress={() => adjustQty(tt.id, 1)}
                    >
                      <Plus size={18} color={qty >= tt.max_per_order ? "#6b6b6b" : "#fafafa"} strokeWidth={2} />
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
            <Text className="text-foreground text-xl font-bold tracking-tight">Confirm Sale</Text>
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

            {/* Buyer type */}
            <Text className="text-muted-foreground text-xs font-semibold mb-2 uppercase tracking-wide">
              Buyer
            </Text>
            <View className="flex-row gap-2 mb-4">
              <Pressable
                onPress={() => resetBuyerMode("guest")}
                className={`flex-1 py-3 rounded-xl border flex-row items-center justify-center gap-2 active:opacity-70 ${
                  buyerMode === "guest" ? "bg-primary border-primary" : "bg-card border-border"
                }`}
              >
                <User size={15} color={buyerMode === "guest" ? "#000000" : "#fafafa"} strokeWidth={1.75} />
                <Text className={`font-semibold text-sm ${buyerMode === "guest" ? "text-primary-foreground" : "text-foreground"}`}>
                  Guest
                </Text>
              </Pressable>
              <Pressable
                onPress={() => resetBuyerMode("registered")}
                className={`flex-1 py-3 rounded-xl border flex-row items-center justify-center gap-2 active:opacity-70 ${
                  buyerMode === "registered" ? "bg-primary border-primary" : "bg-card border-border"
                }`}
              >
                <QrCode size={15} color={buyerMode === "registered" ? "#000000" : "#fafafa"} strokeWidth={1.75} />
                <Text className={`font-semibold text-sm ${buyerMode === "registered" ? "text-primary-foreground" : "text-foreground"}`}>
                  Registered
                </Text>
              </Pressable>
            </View>

            {buyerMode === "guest" ? (
              <View className="gap-3 mb-4">
                <Input placeholder="Buyer name (optional)" value={buyerName} onChangeText={setBuyerName} />
                <Input
                  placeholder="Buyer email (for invoice)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={buyerEmail}
                  onChangeText={setBuyerEmail}
                />
                {/* Billing address for Billingo invoice */}
                <View className="flex-row items-center justify-between pt-1">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                    Billing address {billingData ? "✓" : "(optional)"}
                  </Text>
                  <Button variant="ghost" size="sm" onPress={() => { setBillingUserId(null); setBillingOpen(true); }}>
                    <Text className="text-muted-foreground text-xs">{billingData ? "Edit" : "Add"}</Text>
                  </Button>
                </View>
                {billingData && (
                  <View className="px-3 py-2 rounded-xl bg-card border border-border">
                    <Text className="text-foreground text-sm">{billingData.billingName}</Text>
                    <Text className="text-muted-foreground text-xs">{billingData.billingAddress}, {billingData.billingCity}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="mb-6">
                {registeredProfile ? (
                  <View className="flex-row items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
                    <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                      <UserCheck size={18} color="#fafafa" strokeWidth={1.75} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-semibold">{registeredProfile.name}</Text>
                      <Text className="text-muted-foreground text-xs">{registeredProfile.email}</Text>
                    </View>
                    <Pressable onPress={() => setRegisteredProfile(null)} className="active:opacity-70 p-1">
                      <X size={16} color="#8f8f8f" strokeWidth={1.75} />
                    </Pressable>
                  </View>
                ) : scannerOpen ? (
                  <View style={{ height: 260, borderRadius: 16, overflow: "hidden", position: "relative" }}>
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={({ data }) => {
                        if (scanCooldown.current || !data) return;
                        resolveWalletToken(data);
                      }}
                    />
                    {/* Aim frame */}
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
                      <View style={{ width: 160, height: 160, borderRadius: 12, borderWidth: 2, borderColor: "#ffffff" }} />
                    </View>
                    {/* Close */}
                    <Pressable
                      onPress={() => setScannerOpen(false)}
                      style={{ position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 6 }}
                    >
                      <X size={18} color="#ffffff" strokeWidth={1.75} />
                    </Pressable>
                    {resolving && (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", borderRadius: 16 }]}>
                        <ActivityIndicator size="large" color="#ffffff" />
                      </View>
                    )}
                  </View>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onPress={openScanner}
                    loading={resolving}
                    icon={<QrCode size={16} color="#fafafa" strokeWidth={1.75} />}
                  >
                    <Text>Scan Customer QR</Text>
                  </Button>
                )}
                {/* Billing warning for registered user with missing billing */}
                {registeredProfile && !registeredProfile.hasBilling && !billingData && (
                  <View className="flex-row items-center justify-between px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 mt-2">
                    <Text className="text-amber-400 text-xs flex-1">Billing address missing — invoice may be incomplete</Text>
                    <Button variant="ghost" size="sm" onPress={() => { setBillingUserId(registeredProfile.id); setBillingOpen(true); }}>
                      <Text className="text-amber-400 text-xs font-semibold">Add</Text>
                    </Button>
                  </View>
                )}
              </View>
            )}

            {/* Payment method selector */}
            <Text className="text-muted-foreground text-xs font-semibold mb-2 uppercase tracking-wide">
              Payment Method
            </Text>
            <View className="flex-row gap-2 mb-4">
              <Pressable
                onPress={() => setPaymentMethod("cash")}
                className={`flex-1 py-3 rounded-xl border flex-row items-center justify-center gap-2 active:opacity-70 ${
                  paymentMethod === "cash"
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Banknote size={16} color={paymentMethod === "cash" ? "#000000" : "#fafafa"} strokeWidth={1.75} />
                <Text className={`font-semibold ${paymentMethod === "cash" ? "text-primary-foreground" : "text-foreground"}`}>
                  Cash
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPaymentMethod("tap");
                  if (tapState === "idle") initTapToPay();
                }}
                className={`flex-1 py-3 rounded-xl border flex-row items-center justify-center gap-2 active:opacity-70 ${
                  paymentMethod === "tap"
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Smartphone size={16} color={paymentMethod === "tap" ? "#000000" : "#fafafa"} strokeWidth={1.75} />
                <Text className={`font-semibold ${paymentMethod === "tap" ? "text-primary-foreground" : "text-foreground"}`}>
                  Tap to Pay
                </Text>
              </Pressable>
            </View>

            {/* Tap to Pay status in modal */}
            {paymentMethod === "tap" && tapState !== "idle" && (
              <View className="px-4 py-3 rounded-xl mb-4 bg-card border border-border">
                <View className="flex-row items-center gap-2">
                  {(tapState === "discovering" || tapState === "connecting") && (
                    <ActivityIndicator size="small" color="#fafafa" />
                  )}
                  {tapState === "ready" && <Check size={14} color="#fafafa" strokeWidth={2} />}
                  <Text className={`text-sm ${tapState === "error" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {tapMessage}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View className="py-4 gap-3">
            {paymentMethod === "cash" ? (
              <SlideToConfirm
                label={`Slide to collect ${formatCurrency(cartTotal)}`}
                confirmedLabel="Sold!"
                color="#22c55e"
                disabled={selling || cart.length === 0}
                onConfirm={sellCash}
                icon={<Banknote size={22} color="#000000" strokeWidth={2} />}
              />
            ) : (
              <SlideToConfirm
                label={`Slide to charge ${formatCurrency(cartTotal)}`}
                confirmedLabel="Charged!"
                color="#22c55e"
                disabled={selling || tapState !== "ready" || cart.length === 0}
                onConfirm={sellTap}
                icon={<Smartphone size={22} color="#000000" strokeWidth={2} />}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Billing edit modal */}
      <BillingEditModal
        visible={billingOpen}
        onClose={() => { setBillingOpen(false); setBillingUserId(null); }}
        profileId={billingUserId ?? undefined}
        initialData={billingData ? {
          billingName:    billingData.billingName,
          billingAddress: billingData.billingAddress,
          billingCity:    billingData.billingCity,
          billingPostal:  billingData.billingPostal,
          billingCountry: billingData.billingCountry,
        } : undefined}
        onSave={(data) => {
          setBillingData(data);
          if (registeredProfile) setRegisteredProfile({ ...registeredProfile, hasBilling: true });
        }}
        subtitle="Needed for the Billingo invoice. Saved to the customer's profile."
      />

      {/* Success modal */}
      <Modal visible={!!successInfo} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <Card className="w-full items-center p-8">
            <View className="w-20 h-20 rounded-3xl items-center justify-center mb-5 border border-border bg-muted">
              <PartyPopper size={36} color="#fafafa" strokeWidth={1.5} />
            </View>
            <Text className="text-foreground text-2xl font-bold mb-1 tracking-tight">Sold!</Text>
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
