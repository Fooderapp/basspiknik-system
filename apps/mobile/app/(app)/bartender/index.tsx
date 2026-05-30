import { useState, useEffect, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  ActivityIndicator, ScrollView, Vibration, Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import type { DrinkOrder, DrinkOrderItem } from "@/lib/types";

interface OrderWithItems extends DrinkOrder {
  items: (DrinkOrderItem & { drink: { name: string; price: number } })[];
}

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

export default function BartenderScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [orders, setOrders] = useState<DrinkOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderWithItems | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [completing, setCompleting] = useState(false);
  const cooldown = useRef(false);
  const myOrderIds = useRef<Set<string>>(new Set());

  async function loadQueue() {
    const res = await fetch(`${APP_URL}/api/bar/orders`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (res.ok) { const d = await res.json(); setOrders(d); }
  }

  useEffect(() => {
    loadQueue();
    // Realtime subscription
    const channel = supabase
      .channel("bartender-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "drink_orders" }, () => loadQueue())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleScan(token: string) {
    if (cooldown.current || loadingOrder) return;
    cooldown.current = true;
    Vibration.vibrate(50);
    setLoadingOrder(true);
    try {
      const res = await fetch(`${APP_URL}/api/bar/orders?token=${token}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) { Alert.alert("Error", "Order not found"); return; }
      const order = await res.json();

      if (order.status === "FULFILLED") {
        Alert.alert("Already Fulfilled", "This order has already been completed.", [
          { text: "OK", onPress: () => { cooldown.current = false; } }
        ]);
        return;
      }
      if (order.status === "CANCELLED") {
        Alert.alert("Cancelled", "This order was cancelled.", [
          { text: "OK", onPress: () => { cooldown.current = false; } }
        ]);
        return;
      }
      if (order.status === "IN_PROGRESS" && !myOrderIds.current.has(order.id)) {
        Alert.alert("In Progress", "This order is being processed on another device.", [
          { text: "OK", onPress: () => { cooldown.current = false; } }
        ]);
        return;
      }

      // Fetch full order with items
      const fullRes = await fetch(`${APP_URL}/api/bar/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const fullOrder = await fullRes.json();

      if (order.status === "PENDING") {
        // Claim it
        await fetch(`${APP_URL}/api/bar/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        });
        myOrderIds.current.add(order.id);
        fullOrder.status = "IN_PROGRESS";
        loadQueue();
      }

      setActiveOrder(fullOrder);
      setScanning(false);
    } catch { Alert.alert("Error", "Network error"); cooldown.current = false; }
    finally { setLoadingOrder(false); }
  }

  async function toggleItem(itemId: string, fulfilled: boolean) {
    if (!activeOrder) return;
    await fetch(`${APP_URL}/api/bar/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ items: [{ id: itemId, fulfilled }] }),
    });
    setActiveOrder(prev => prev ? {
      ...prev,
      items: prev.items.map(i => i.id === itemId ? { ...i, fulfilled_at: fulfilled ? new Date().toISOString() : null } : i),
    } : null);
  }

  async function completeOrder() {
    if (!activeOrder) return;
    setCompleting(true);
    await fetch(`${APP_URL}/api/bar/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ status: "FULFILLED" }),
    });
    myOrderIds.current.delete(activeOrder.id);
    setActiveOrder(null);
    setScanning(true);
    setCompleting(false);
    cooldown.current = false;
    loadQueue();
  }

  const allDone = activeOrder?.items.every(i => !!i.fulfilled_at) ?? false;
  const pendingCount = orders.filter(o => o.status === "PENDING").length;
  const inProgressCount = orders.filter(o => o.status === "IN_PROGRESS").length;

  if (!permission?.granted) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-5xl mb-4">📷</Text>
        <Text className="text-foreground text-xl font-bold mb-2">Camera Required</Text>
        <TouchableOpacity onPress={requestPermission} className="bg-primary px-6 py-3 rounded-xl">
          <Text className="text-white font-semibold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Text className="text-white text-xl font-bold">🍺 Bartender</Text>
        <View className="flex-row gap-3">
          {pendingCount > 0 && (
            <View className="bg-warning/20 px-2 py-1 rounded-lg">
              <Text className="text-warning text-xs font-bold">{pendingCount} pending</Text>
            </View>
          )}
          {inProgressCount > 0 && (
            <View className="bg-blue-500/20 px-2 py-1 rounded-lg">
              <Text className="text-blue-400 text-xs font-bold">{inProgressCount} in progress</Text>
            </View>
          )}
        </View>
      </View>

      {/* Scanner */}
      {scanning && (
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handleScan(data)}
          />
          <View className="absolute inset-0 items-center justify-center">
            <View className="w-56 h-56 border-2 border-white/60 rounded-2xl" />
            <Text className="text-white/70 text-sm mt-4">Scan customer QR code</Text>
            {loadingOrder && <ActivityIndicator color="#fff" className="mt-4" />}
          </View>

          {/* Queue strip */}
          {orders.length > 0 && (
            <View className="absolute bottom-0 left-0 right-0 pb-6">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                {orders.slice(0, 10).map(o => (
                  <View key={o.id} className="bg-black/70 border border-white/20 rounded-xl px-3 py-2 items-center">
                    <View className={`w-2 h-2 rounded-full mb-1 ${o.status === "IN_PROGRESS" ? "bg-blue-400" : "bg-warning"}`} />
                    <Text className="text-white text-xs font-mono">{o.qr_token?.slice(-4)}</Text>
                    <Text className="text-white/60 text-xs">{formatCurrency(o.total)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Order detail */}
      {!scanning && activeOrder && (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 120 }}>
          <View className="flex-row items-center justify-between py-4">
            <View>
              <Text className="text-white font-bold text-lg">{activeOrder.guest_name ?? "Guest"}</Text>
              <Text className="text-white/50 text-xs font-mono">{activeOrder.qr_token}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setScanning(true); setActiveOrder(null); cooldown.current = false; }}
              className="bg-white/10 px-3 py-2 rounded-lg"
            >
              <Text className="text-white text-sm">← Scan</Text>
            </TouchableOpacity>
          </View>

          {activeOrder.notes && (
            <View className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 mb-4">
              <Text className="text-warning text-sm">📝 {activeOrder.notes}</Text>
            </View>
          )}

          <View className="gap-3">
            {activeOrder.items?.map(item => {
              const done = !!item.fulfilled_at;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => toggleItem(item.id, !done)}
                  activeOpacity={0.8}
                  className={`rounded-2xl p-4 flex-row items-center gap-4 border ${done ? "bg-green-900/40 border-green-700/50" : "bg-card border-border"}`}
                >
                  <View className={`w-8 h-8 rounded-full border-2 items-center justify-center ${done ? "bg-success border-success" : "border-border"}`}>
                    {done && <Text className="text-white text-sm">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className={`font-semibold text-base ${done ? "text-white/50 line-through" : "text-white"}`}>
                      {item.drink?.name ?? "Item"}
                    </Text>
                    <Text className="text-white/50 text-sm">× {item.quantity}  ·  {formatCurrency(item.unit_price)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Complete button */}
      {!scanning && activeOrder && (
        <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-4 bg-black/80">
          <TouchableOpacity
            onPress={completeOrder}
            disabled={!allDone || completing}
            className={`rounded-2xl py-5 items-center ${allDone ? "bg-success" : "bg-muted"}`}
          >
            {completing
              ? <ActivityIndicator color="#fff" />
              : <Text className={`font-bold text-lg ${allDone ? "text-white" : "text-muted-foreground"}`}>
                  {allDone ? "✅ Complete Order" : `Complete (${activeOrder.items?.filter(i => !!i.fulfilled_at).length}/${activeOrder.items?.length} done)`}
                </Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
