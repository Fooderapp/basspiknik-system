import { useEffect, useState, useRef } from "react";
import { View, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { ChevronLeft, Clock, Loader, CheckCircle2, XCircle, type LucideIcon } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";

type OrderStatus = "PENDING" | "IN_PROGRESS" | "FULFILLED" | "CANCELLED";

const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  PENDING:     Clock,
  IN_PROGRESS: Loader,
  FULFILLED:   CheckCircle2,
  CANCELLED:   XCircle,
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

  const StatusIcon = STATUS_ICON[status];
  const isTerminal = status === "FULFILLED" || status === "CANCELLED";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 py-4">
        <Pressable onPress={() => router.replace("/(app)/menu" as never)} className="active:opacity-60 flex-row items-center gap-0.5">
          <ChevronLeft size={18} color="#fafafa" strokeWidth={1.75} />
          <Text className="text-foreground text-base">Menu</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16 }}>
        <View className="w-20 h-20 rounded-3xl items-center justify-center mb-5 border border-border bg-muted">
          <StatusIcon size={36} color="#fafafa" strokeWidth={1.5} />
        </View>

        <Text className="text-foreground text-2xl font-bold mb-3 text-center tracking-tight">{STATUS_LABEL[status]}</Text>

        <View className="px-4 py-1.5 rounded-full mb-8 border border-border">
          <Text className="text-muted-foreground font-semibold text-xs tracking-wide">{status.replace("_", " ")}</Text>
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
          <Button
            onPress={cancelOrder}
            disabled={cancelling}
            loading={cancelling}
            variant="outline"
            className="border-destructive w-full mb-3"
          >
            <Text className="text-destructive font-semibold">Cancel Order</Text>
          </Button>
        )}

        {isTerminal && (
          <Button
            onPress={() => router.replace("/(app)/menu" as never)}
            className="w-full"
          >
            <Text>New Order</Text>
          </Button>
        )}
      </ScrollView>
    </View>
  );
}
