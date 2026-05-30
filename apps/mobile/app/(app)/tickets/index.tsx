import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  VALID:     "#22c55e",
  USED:      "#71717a",
  CANCELLED: "#ef4444",
  REFUNDED:  "#f59e0b",
};

export default function TicketsScreen() {
  const { session } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!session) return;
    const { data } = await (supabase as any)
      .from("tickets")
      .select("*, orders!inner(user_id)")
      .eq("orders.user_id", session.user.id)
      .order("created_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <Screen title="My Tickets">
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="My Tickets" subtitle={`${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}`} scroll={false} padded={false}>
      <FlatList
        data={tickets}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
        ListEmptyComponent={
          <View className="items-center py-20">
            <Text className="text-5xl mb-4">🎟️</Text>
            <Text className="text-foreground font-semibold text-lg">No tickets yet</Text>
            <Text className="text-muted-foreground text-sm mt-1">Your purchased tickets appear here</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/(app)/tickets/${item.id}` as never)}
            activeOpacity={0.8}
            className="bg-card border border-border rounded-2xl p-4 mb-3"
          >
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-base" numberOfLines={1}>
                  {item.ticket_name ?? "Ticket"}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{formatDate(item.created_at)}</Text>
              </View>
              <View
                className="px-2 py-1 rounded-md ml-3"
                style={{ backgroundColor: STATUS_COLOR[item.status] + "22" }}
              >
                <Text className="text-xs font-semibold" style={{ color: STATUS_COLOR[item.status] }}>
                  {item.status}
                </Text>
              </View>
            </View>
            {item.holder_name && (
              <Text className="text-muted-foreground text-sm">👤 {item.holder_name}</Text>
            )}
            <View className="mt-3 border-t border-border pt-3">
              <Text className="text-muted-foreground text-xs">Tap to view QR code →</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}
