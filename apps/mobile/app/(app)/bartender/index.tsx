import { useState, useEffect, useRef } from "react";
import {
  View, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Vibration, Pressable,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, ChevronLeft, StickyNote, Check } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import type { DrinkOrder, DrinkOrderItem, Drink } from "@/lib/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";

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
        <View className="w-16 h-16 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
          <Camera size={28} color="#fafafa" strokeWidth={1.75} />
        </View>
        <Text className="text-foreground text-xl font-bold mb-2 tracking-tight">Camera Required</Text>
        <Button onPress={requestPermission} className="mt-4">
          <Text>Grant Permission</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Text className="text-white text-xl font-bold tracking-tight">Bartender</Text>
        <View className="flex-row gap-2">
          {pending > 0 && (
            <View style={{ backgroundColor: "#F59E0B" }} className="px-2.5 py-1 rounded-lg">
              <Text className="text-white text-xs font-bold">{pending} pending</Text>
            </View>
          )}
          {inProg > 0 && (
            <View style={{ backgroundColor: "#3B82F6" }} className="px-2.5 py-1 rounded-lg">
              <Text className="text-white text-xs font-bold">{inProg} active</Text>
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
                    <View
                      style={{ backgroundColor: o.status === "IN_PROGRESS" ? "#3B82F6" : "#F59E0B" }}
                      className="w-2 h-2 rounded-full mb-1"
                    />
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
                <Text className="text-white font-bold text-lg tracking-tight">{activeOrder.guest_name ?? "Guest"}</Text>
                <Text className="text-white/40 text-xs font-mono">{activeOrder.qr_token}</Text>
              </View>
              <Pressable
                onPress={() => { setScanning(true); setActiveOrder(null); cooldown.current = false; }}
                className="bg-white/10 px-3 py-2 rounded-xl active:opacity-60 flex-row items-center gap-1"
              >
                <ChevronLeft size={15} color="#ffffff" strokeWidth={1.75} />
                <Text className="text-white text-sm">Scan</Text>
              </Pressable>
            </View>

            {activeOrder.notes && (
              <View className="bg-card border border-border rounded-xl px-4 py-3 mb-4 flex-row items-center gap-2">
                <StickyNote size={15} color="#8f8f8f" strokeWidth={1.75} />
                <Text className="text-muted-foreground text-sm flex-1">{activeOrder.notes}</Text>
              </View>
            )}

            {/* Items */}
            <View className="gap-3">
              {items.map(item => {
                const done = !!item.fulfilled_at;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleItem(item.id, !done)}
                    style={done ? { backgroundColor: "#22C55E18", borderColor: "#22C55E55" } : undefined}
                    className={`rounded-2xl p-4 flex-row items-center gap-4 border active:opacity-80 ${
                      done ? "" : "bg-card border-border"
                    }`}
                  >
                    <View
                      style={done ? { backgroundColor: "#22C55E", borderColor: "#22C55E" } : undefined}
                      className={`w-9 h-9 rounded-full border-2 items-center justify-center ${done ? "" : "border-border"}`}
                    >
                      {done && <Check size={18} color="#ffffff" strokeWidth={2.5} />}
                    </View>
                    <View className="flex-1">
                      <Text className={`font-semibold text-base ${done ? "text-white/40 line-through" : "text-white"}`}>
                        {item.drinks?.name ?? "Item"}
                      </Text>
                      <Text className="text-white/40 text-sm">
                        × {item.quantity}  ·  {formatCurrency(item.unit_price)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Complete button */}
          <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-4 bg-black/90">
            {allDone ? (
              <SlideToConfirm
                label="Slide to complete order"
                confirmedLabel="Completed!"
                color="#22c55e"
                disabled={completing}
                onConfirm={completeOrder}
                icon={<Check size={22} color="#000000" strokeWidth={2.5} />}
              />
            ) : (
              <Button disabled variant="secondary" className="w-full py-5 rounded-2xl">
                <Text>{`${doneCount} / ${items.length} done`}</Text>
              </Button>
            )}
          </View>
        </>
      )}
    </View>
  );
}
