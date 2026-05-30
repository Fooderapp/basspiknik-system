import { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Vibration,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import type { DrinkOrder, DrinkOrderItem, Drink } from "@/lib/types";

type ItemWithDrink = DrinkOrderItem & { drinks: Pick<Drink, "name" | "price"> };
type OrderWithItems = DrinkOrder & { drink_order_items: ItemWithDrink[] };

export default function BartenderScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]       = useState(true);
  const [queue, setQueue]             = useState<DrinkOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading]         = useState(false);
  const [completing, setCompleting]   = useState(false);
  const cooldown   = useRef(false);
  const myOrderIds = useRef<Set<string>>(new Set());

  // Load queue
  async function loadQueue() {
    const { data } = await (supabase as any)
      .from("drink_orders")
      .select("*")
      .in("status", ["PENDING", "IN_PROGRESS"])
      .order("created_at");
    setQueue(data ?? []);
  }

  useEffect(() => {
    loadQueue();
    const channel = supabase
      .channel("bartender-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "drink_orders" }, loadQueue)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleScan(token: string) {
    if (cooldown.current || loading) return;
    cooldown.current = true;
    Vibration.vibrate(50);
    setLoading(true);

    try {
      // Find order by token
      const { data: order, error } = await (supabase as any)
        .from("drink_orders")
        .select("*")
        .eq("qr_token", token)
        .single();

      if (error || !order) {
        Alert.alert("Not Found", "No order for this QR code.", [
          { text: "OK", onPress: () => { cooldown.current = false; } },
        ]);
        return;
      }

      if (order.status === "FULFILLED") {
        Alert.alert("Already Fulfilled", "This order has been completed.", [
          { text: "OK", onPress: () => { cooldown.current = false; } },
        ]);
        return;
      }
      if (order.status === "CANCELLED") {
        Alert.alert("Cancelled", "This order was cancelled.", [
          { text: "OK", onPress: () => { cooldown.current = false; } },
        ]);
        return;
      }
      if (order.status === "IN_PROGRESS" && !myOrderIds.current.has(order.id)) {
        Alert.alert("In Progress", "This order is being processed on another device.", [
          { text: "OK", onPress: () => { cooldown.current = false; } },
        ]);
        return;
      }

      // Claim PENDING order
      if (order.status === "PENDING") {
        await (supabase as any)
          .from("drink_orders")
          .update({ status: "IN_PROGRESS" })
          .eq("id", order.id);
        myOrderIds.current.add(order.id);
        loadQueue();
      }

      // Fetch full order with items + drinks
      const { data: full } = await (supabase as any)
        .from("drink_orders")
        .select("*, drink_order_items(*, drinks(name, price))")
        .eq("id", order.id)
        .single();

      setActiveOrder(full);
      setScanning(false);
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(itemId: string, fulfilled: boolean) {
    await (supabase as any)
      .from("drink_order_items")
      .update({ fulfilled_at: fulfilled ? new Date().toISOString() : null })
      .eq("id", itemId);

    setActiveOrder(prev => prev ? {
      ...prev,
      drink_order_items: prev.drink_order_items.map(i =>
        i.id === itemId ? { ...i, fulfilled_at: fulfilled ? new Date().toISOString() : null } : i
      ),
    } : null);
  }

  async function completeOrder() {
    if (!activeOrder) return;
    setCompleting(true);
    await (supabase as any)
      .from("drink_orders")
      .update({ status: "FULFILLED" })
      .eq("id", activeOrder.id);

    myOrderIds.current.delete(activeOrder.id);
    setActiveOrder(null);
    setScanning(true);
    setCompleting(false);
    cooldown.current = false;
    loadQueue();
  }

  const items    = activeOrder?.drink_order_items ?? [];
  const allDone  = items.length > 0 && items.every(i => !!i.fulfilled_at);
  const doneCount = items.filter(i => !!i.fulfilled_at).length;
  const pending  = queue.filter(o => o.status === "PENDING").length;
  const inProg   = queue.filter(o => o.status === "IN_PROGRESS").length;

  if (!permission?.granted) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-5xl mb-4">📷</Text>
        <Text className="text-foreground text-xl font-bold mb-2">Camera Required</Text>
        <TouchableOpacity onPress={requestPermission} className="bg-primary px-6 py-3 rounded-xl mt-4">
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
        <View className="flex-row gap-2">
          {pending > 0 && (
            <View className="bg-warning/20 px-2.5 py-1 rounded-lg">
              <Text className="text-warning text-xs font-bold">{pending} pending</Text>
            </View>
          )}
          {inProg > 0 && (
            <View className="bg-blue-500/20 px-2.5 py-1 rounded-lg">
              <Text className="text-blue-400 text-xs font-bold">{inProg} active</Text>
            </View>
          )}
        </View>
      </View>

      {/* Scanner view */}
      {scanning && (
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handleScan(data)}
          />

          {/* Frame overlay */}
          <View className="absolute inset-0 items-center justify-center">
            <View className="w-56 h-56 border-2 border-white/60 rounded-2xl" />
            <Text className="text-white/70 text-sm mt-4">Scan customer QR code</Text>
            {loading && <ActivityIndicator color="#fff" className="mt-3" />}
          </View>

          {/* Queue strip at bottom */}
          {queue.length > 0 && (
            <View className="absolute bottom-0 left-0 right-0 pb-8">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              >
                {queue.slice(0, 12).map(o => (
                  <View key={o.id} className="bg-black/70 border border-white/20 rounded-xl px-3 py-2 items-center">
                    <View className={`w-2 h-2 rounded-full mb-1 ${o.status === "IN_PROGRESS" ? "bg-blue-400" : "bg-warning"}`} />
                    <Text className="text-white text-xs font-mono">{o.qr_token?.slice(-4)}</Text>
                    <Text className="text-white/50 text-xs">{formatCurrency(o.total)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Order detail view */}
      {!scanning && activeOrder && (
        <>
          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 130 }}>
            {/* Order header */}
            <View className="flex-row items-center justify-between py-4 border-b border-white/10 mb-4">
              <View>
                <Text className="text-white font-bold text-lg">{activeOrder.guest_name ?? "Guest"}</Text>
                <Text className="text-white/40 text-xs font-mono">{activeOrder.qr_token}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { setScanning(true); setActiveOrder(null); cooldown.current = false; }}
                className="bg-white/10 px-3 py-2 rounded-xl"
              >
                <Text className="text-white text-sm">← Scan</Text>
              </TouchableOpacity>
            </View>

            {activeOrder.notes && (
              <View className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 mb-4">
                <Text className="text-warning text-sm">📝 {activeOrder.notes}</Text>
              </View>
            )}

            {/* Items */}
            <View className="gap-3">
              {items.map(item => {
                const done = !!item.fulfilled_at;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => toggleItem(item.id, !done)}
                    activeOpacity={0.8}
                    className={`rounded-2xl p-4 flex-row items-center gap-4 border ${
                      done
                        ? "bg-green-900/40 border-green-700/50"
                        : "bg-card border-border"
                    }`}
                  >
                    <View className={`w-9 h-9 rounded-full border-2 items-center justify-center ${
                      done ? "bg-success border-success" : "border-border"
                    }`}>
                      {done && <Text className="text-white font-bold">✓</Text>}
                    </View>
                    <View className="flex-1">
                      <Text className={`font-semibold text-base ${done ? "text-white/40 line-through" : "text-white"}`}>
                        {item.drinks?.name ?? "Item"}
                      </Text>
                      <Text className="text-white/40 text-sm">
                        × {item.quantity}  ·  {formatCurrency(item.unit_price)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Complete button */}
          <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-4 bg-black/90">
            <TouchableOpacity
              onPress={completeOrder}
              disabled={!allDone || completing}
              className={`rounded-2xl py-5 items-center ${allDone ? "bg-success" : "bg-white/10"}`}
            >
              {completing
                ? <ActivityIndicator color="#fff" />
                : (
                  <Text className={`font-bold text-lg ${allDone ? "text-white" : "text-white/40"}`}>
                    {allDone ? "✅ Complete Order" : `${doneCount} / ${items.length} done`}
                  </Text>
                )
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
