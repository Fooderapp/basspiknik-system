import { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

type OrderStatus = "PENDING" | "IN_PROGRESS" | "FULFILLED" | "CANCELLED";

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING:     "#f59e0b",
  IN_PROGRESS: "#3b82f6",
  FULFILLED:   "#22c55e",
  CANCELLED:   "#ef4444",
};
const STATUS_EMOJI: Record<OrderStatus, string> = {
  PENDING:     "⏳",
  IN_PROGRESS: "🔄",
  FULFILLED:   "✅",
  CANCELLED:   "❌",
};
const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING:     "Order Placed!",
  IN_PROGRESS: "Being Prepared",
  FULFILLED:   "Ready — Pick Up!",
  CANCELLED:   "Cancelled",
};

export default function OrderStatusScreen() {
  const { orderId, qrToken } = useLocalSearchParams<{ orderId: string; qrToken: string }>();
  const insets  = useSafeAreaInsets();
  const [status, setStatus]       = useState<OrderStatus>("PENDING");
  const [total, setTotal]         = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial fetch
  useEffect(() => {
    (supabase as any)
      .from("drink_orders")
      .select("status, total")
      .eq("id", orderId)
      .single()
      .then(({ data }: any) => {
        if (data) { setStatus(data.status); setTotal(data.total); }
      });
  }, [orderId]);

  // Realtime subscription — no polling needed
  useEffect(() => {
    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drink_orders", filter: `id=eq.${orderId}` },
        (payload: any) => {
          setStatus(payload.new.status as OrderStatus);
          if (payload.new.total) setTotal(payload.new.total);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  async function cancelOrder() {
    setCancelling(true);
    const { data, error } = await supabase.rpc("cancel_bar_order", {
      p_order_id: orderId,
      p_qr_token: qrToken,
    });
    if (!error && data?.ok) setStatus("CANCELLED");
    else alert(data?.error ?? error?.message ?? "Failed to cancel");
    setCancelling(false);
  }

  const color      = STATUS_COLOR[status];
  const isTerminal = status === "FULFILLED" || status === "CANCELLED";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 py-4">
        <TouchableOpacity onPress={() => router.replace("/(app)/menu" as never)}>
          <Text className="text-primary text-base">← Menu</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16 }}>
        <Text className="text-6xl mb-4">{STATUS_EMOJI[status]}</Text>

        <Text className="text-foreground text-2xl font-bold mb-2 text-center">{STATUS_LABEL[status]}</Text>

        <View className="px-4 py-1.5 rounded-full mb-8" style={{ backgroundColor: color + "22" }}>
          <Text className="font-semibold text-sm" style={{ color }}>{status.replace("_", " ")}</Text>
        </View>

        {/* QR code */}
        {status !== "CANCELLED" && qrToken && (
          <View className="bg-white rounded-3xl p-5 mb-6 items-center gap-3">
            <QRCode value={qrToken} size={200} />
            <Text className="text-black/40 text-xs font-mono">{qrToken}</Text>
          </View>
        )}

        {total > 0 && (
          <Text className="text-muted-foreground text-sm mb-8">
            Total: {formatCurrency(total)}
          </Text>
        )}

        {status === "IN_PROGRESS" && (
          <View className="bg-card border border-border rounded-xl px-5 py-4 w-full mb-6">
            <Text className="text-muted-foreground text-sm text-center">
              A bartender is preparing your order. Show your QR code when picking up.
            </Text>
          </View>
        )}

        {status === "PENDING" && (
          <TouchableOpacity
            onPress={cancelOrder}
            disabled={cancelling}
            className="border border-destructive rounded-xl px-6 py-3.5 w-full items-center mb-3"
          >
            {cancelling
              ? <ActivityIndicator color="#ef4444" />
              : <Text className="text-destructive font-semibold">Cancel Order</Text>
            }
          </TouchableOpacity>
        )}

        {isTerminal && (
          <TouchableOpacity
            onPress={() => router.replace("/(app)/menu" as never)}
            className="bg-primary rounded-xl px-6 py-4 w-full items-center"
          >
            <Text className="text-white font-bold text-base">New Order</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
