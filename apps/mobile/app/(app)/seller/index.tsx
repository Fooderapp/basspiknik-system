import { useState, useEffect } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { TicketType, Event } from "@/lib/types";

interface CartItem { ticketType: TicketType; quantity: number }

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

export default function SellerScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ orderId: string; total: number } | null>(null);

  useEffect(() => {
    (supabase as any)
      .from("events")
      .select("*")
      .eq("status", "PUBLISHED")
      .order("start_date")
      .then(({ data }: { data: Event[] }) => { setEvents(data ?? []); setLoading(false); });
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
        const item = prev[idx];
        if (item.quantity >= tt.max_per_order) return prev;
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

  const cartTotal = cart.reduce((s, i) => {
    const p = i.ticketType.sale_enabled && i.ticketType.sale_price ? i.ticketType.sale_price : i.ticketType.price;
    return s + p * i.quantity;
  }, 0);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  async function sellCash() {
    if (cart.length === 0) return;
    setSelling(true);
    try {
      const res = await fetch(`${APP_URL}/api/orders/cash`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          eventId: selectedEvent!.id,
          buyerName: buyerName.trim() || null,
          buyerEmail: buyerEmail.trim() || null,
          items: cart.map(c => ({ ticketTypeId: c.ticketType.id, quantity: c.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccessInfo({ orderId: data.id, total: data.total });
      setCart([]);
      setBuyerName("");
      setBuyerEmail("");
      setConfirmOpen(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSelling(false);
    }
  }

  if (loading) {
    return <View className="flex-1 bg-background items-center justify-center"><ActivityIndicator size="large" color="#7c3aed" /></View>;
  }

  // Event selection
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
            <TouchableOpacity
              onPress={() => selectEvent(item)}
              activeOpacity={0.8}
              className="bg-card border border-border rounded-2xl p-4 mb-3"
            >
              <Text className="text-foreground font-bold text-base">{item.name}</Text>
              {item.venue && <Text className="text-muted-foreground text-sm mt-0.5">📍 {item.venue}</Text>}
              <Text className="text-muted-foreground text-sm mt-0.5">📅 {formatDate(item.start_date)}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  // POS view
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-1 mr-3">
          <TouchableOpacity onPress={() => setSelectedEvent(null)}>
            <Text className="text-primary text-sm mb-1">← Events</Text>
          </TouchableOpacity>
          <Text className="text-foreground font-bold text-lg" numberOfLines={1}>{selectedEvent.name}</Text>
        </View>
        {cartCount > 0 && (
          <TouchableOpacity
            onPress={() => setConfirmOpen(true)}
            className="bg-primary px-4 py-2.5 rounded-xl"
          >
            <Text className="text-white font-bold">{cartCount} · {formatCurrency(cartTotal)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Ticket types */}
      <FlatList
        data={ticketTypes}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        renderItem={({ item: tt }) => {
          const price = tt.sale_enabled && tt.sale_price ? tt.sale_price : tt.price;
          const qty = cart.find(c => c.ticketType.id === tt.id)?.quantity ?? 0;
          const available = tt.quantity - tt.sold;
          return (
            <View className="bg-card border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-foreground font-bold text-base">{tt.name}</Text>
                  {tt.description && <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={2}>{tt.description}</Text>}
                  <Text className="text-muted-foreground text-xs mt-1">{available} available · {tt.tier}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-foreground font-bold text-lg">{formatCurrency(price)}</Text>
                  {tt.sale_enabled && tt.sale_price && (
                    <Text className="text-muted-foreground text-xs line-through">{formatCurrency(tt.price)}</Text>
                  )}
                </View>
              </View>
              <View className="flex-row justify-end items-center gap-3">
                {qty === 0 ? (
                  <TouchableOpacity
                    onPress={() => addToCart(tt)}
                    disabled={available === 0}
                    className={`px-5 py-2.5 rounded-xl ${available > 0 ? "bg-primary" : "bg-muted"}`}
                  >
                    <Text className={`font-semibold ${available > 0 ? "text-white" : "text-muted-foreground"}`}>
                      {available > 0 ? "+ Add" : "Sold out"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="flex-row items-center gap-3 bg-muted rounded-xl px-3 py-2">
                    <TouchableOpacity onPress={() => adjustQty(tt.id, -1)}>
                      <Text className="text-foreground font-bold text-lg">−</Text>
                    </TouchableOpacity>
                    <Text className="text-foreground font-bold w-6 text-center">{qty}</Text>
                    <TouchableOpacity onPress={() => adjustQty(tt.id, 1)} disabled={qty >= tt.max_per_order}>
                      <Text className="text-foreground font-bold text-lg">+</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Checkout modal */}
      <Modal visible={confirmOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setConfirmOpen(false)}>
        <View className="flex-1 bg-background px-5 pt-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-foreground text-xl font-bold">Confirm Sale</Text>
            <TouchableOpacity onPress={() => setConfirmOpen(false)}>
              <Text className="text-muted-foreground">Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1">
            {/* Order summary */}
            {cart.map(item => {
              const p = item.ticketType.sale_enabled && item.ticketType.sale_price ? item.ticketType.sale_price : item.ticketType.price;
              return (
                <View key={item.ticketType.id} className="flex-row justify-between py-2 border-b border-border">
                  <Text className="text-foreground">{item.ticketType.name} × {item.quantity}</Text>
                  <Text className="text-foreground font-semibold">{formatCurrency(p * item.quantity)}</Text>
                </View>
              );
            })}

            <View className="flex-row justify-between py-3 mb-6">
              <Text className="text-foreground font-bold text-lg">Total</Text>
              <Text className="text-foreground font-bold text-lg">{formatCurrency(cartTotal)}</Text>
            </View>

            <TextInput
              className="bg-card border border-border rounded-xl px-4 py-3 text-foreground mb-3"
              placeholder="Buyer name (optional)"
              placeholderTextColor="#71717a"
              value={buyerName}
              onChangeText={setBuyerName}
            />
            <TextInput
              className="bg-card border border-border rounded-xl px-4 py-3 text-foreground mb-6"
              placeholder="Buyer email (optional)"
              placeholderTextColor="#71717a"
              keyboardType="email-address"
              autoCapitalize="none"
              value={buyerEmail}
              onChangeText={setBuyerEmail}
            />
          </ScrollView>

          <View className="py-4 gap-3">
            <TouchableOpacity
              onPress={sellCash}
              disabled={selling}
              className="bg-success rounded-xl py-4 items-center"
            >
              {selling
                ? <ActivityIndicator color="#fff" />
                : <Text className="text-white font-bold text-base">💵 Sell — Cash</Text>
              }
            </TouchableOpacity>
            <Text className="text-muted-foreground text-xs text-center">Tap to Pay (Stripe Terminal) — coming soon</Text>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal visible={!!successInfo} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-card border border-border rounded-3xl p-8 w-full items-center">
            <Text className="text-6xl mb-4">🎉</Text>
            <Text className="text-foreground text-2xl font-bold mb-1">Sold!</Text>
            <Text className="text-muted-foreground text-sm mb-6">Tickets issued successfully</Text>
            {successInfo && (
              <Text className="text-foreground font-bold text-xl mb-6">{formatCurrency(successInfo.total)}</Text>
            )}
            <TouchableOpacity
              onPress={() => setSuccessInfo(null)}
              className="bg-primary rounded-xl px-8 py-3.5 w-full items-center"
            >
              <Text className="text-white font-bold text-base">Next Customer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
