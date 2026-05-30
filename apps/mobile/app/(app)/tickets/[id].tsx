import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, Share } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import QRCode from "react-native-qrcode-svg";

const STATUS_COLOR: Record<string, string> = {
  VALID:     "#22c55e",
  USED:      "#71717a",
  CANCELLED: "#ef4444",
  REFUNDED:  "#f59e0b",
};

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (supabase as any)
      .from("tickets")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }: { data: Ticket }) => { setTicket(data); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-foreground text-lg">Ticket not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLOR[ticket.status] ?? "#71717a";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-primary text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-foreground font-bold text-lg flex-1" numberOfLines={1}>
          {ticket.ticket_name ?? "Ticket"}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-6 gap-6">
        {/* QR Code */}
        <View className="bg-white rounded-3xl p-6 shadow-xl">
          {ticket.status === "VALID" ? (
            <QRCode value={ticket.qr_code} size={240} />
          ) : (
            <View className="w-60 h-60 items-center justify-center bg-muted rounded-2xl">
              <Text className="text-5xl mb-2">🚫</Text>
              <Text className="text-muted-foreground text-sm">{ticket.status}</Text>
            </View>
          )}
        </View>

        {/* Status badge */}
        <View
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: statusColor + "22" }}
        >
          <Text className="font-semibold text-sm" style={{ color: statusColor }}>
            {ticket.status}
          </Text>
        </View>

        {/* Details */}
        <View className="bg-card border border-border rounded-2xl p-5 w-full gap-3">
          {ticket.holder_name && (
            <Row label="Name" value={ticket.holder_name} />
          )}
          {ticket.holder_email && (
            <Row label="Email" value={ticket.holder_email} />
          )}
          <Row label="Tier" value={ticket.tier} />
          <Row label="Issued" value={formatDate(ticket.created_at)} />
          {ticket.used_at && (
            <Row label="Used" value={formatDate(ticket.used_at)} />
          )}
          <View className="pt-2 border-t border-border">
            <Text className="text-muted-foreground text-xs font-mono" numberOfLines={1}>
              {ticket.qr_code}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className="text-foreground text-sm font-medium">{value}</Text>
    </View>
  );
}
