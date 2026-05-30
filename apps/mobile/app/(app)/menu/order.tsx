import { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  PENDING:     "#f59e0b",
  IN_PROGRESS: "#3b82f6",
  FULFILLED:   "#22c55e",
  CANCELLED:   "#ef4444",
};

const STATUS_EMOJI: Record<string, string> = {
  PENDING:     "⏳",
  IN_PROGRESS: "🔄",
  FULFILLED:   "✅",
  CANCELLED:   "❌",
};

export default function OrderStatusScreen() {
  const { orderId, token } = useLocalSearchParams<{ orderId: string; token: string }>();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState("PENDING");
  const [total, setTotal] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

  async function fetchStatus() {
    try {
      const res = await fetch(`${APP_URL}/api/bar/orders/${orderId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setTotal(data.total);
      if (data.status === "FULFILLED" || data.status === "CANCELLED") {
        clearInterval(intervalRef.current!);
      }
    } catch {}
  }

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalRef.current!);
  }, [orderId]);

  async function cancelOrder() {
    setCancelling(true);
    try {
      const res = await fetch(`${APP_URL}/api/bar/orders/${orderId}`, { method: "DELETE" });
      if (res.ok) setStatus("CANCELLED");
    } catch {}
    setCancelling(false);
  }

  const color = STATUS_COLOR[status] ?? "#71717a";
  const isPending = status === "PENDING";
  const isInProgress = status === "IN_PROGRESS";
  const isTerminal = status === "FULFILLED" || status === "CANCELLED";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-primary text-base">← Menu</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingHorizontal: 24, paddingBottom: 40, paddingTop: 20 }}>
        {/* Status */}
        <Text className="text-6xl mb-4">{STATUS_EMOJI[status]}</Text>
        <Text className="text-foreground text-2xl font-bold mb-1">
          {status === "PENDING" ? "Order Placed!" : status === "IN_PROGRESS" ? "Being Prepared" : status === "FULFILLED" ? "Ready! Pick up" : "Cancelled"}
        </Text>
        <View className="px-4 py-1.5 rounded-full mb-8" style={{ backgroundColor: color + "22" }}>
          <Text className="font-semibold text-sm" style={{ color }}>{status.replace("_", " ")}</Text>
        </View>

        {/* QR */}
        {status !== "CANCELLED" && (
          <View className="bg-white rounded-3xl p-5 mb-6">
            <QRCode value={token} size={200} />
          </View>
        )}

        {total > 0 && (
          <Text className="text-muted-foreground text-sm mb-8">Total: {formatCurrency(total)}</Text>
        )}

        {/* Actions */}
        {isPending && (
          <TouchableOpacity
            onPress={cancelOrder}
            disabled={cancelling}
            className="border border-destructive rounded-xl px-6 py-3 w-full items-center"
          >
            {cancelling
              ? <ActivityIndicator color="#ef4444" />
              : <Text className="text-destructive font-semibold">Cancel Order</Text>
            }
          </TouchableOpacity>
        )}

        {isInProgress && (
          <View className="bg-card border border-border rounded-xl px-5 py-4 w-full">
            <Text className="text-muted-foreground text-sm text-center">
              A bartender is preparing your order. Show your QR code when picking up.
            </Text>
          </View>
        )}

        {isTerminal && (
          <TouchableOpacity
            onPress={() => router.replace("/(app)/menu" as never)}
            className="bg-primary rounded-xl px-6 py-3.5 w-full items-center"
          >
            <Text className="text-white font-bold text-base">New Order</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
