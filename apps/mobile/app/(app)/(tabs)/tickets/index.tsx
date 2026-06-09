import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ticket as TicketIcon, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "secondary"> = {
  VALID:     "success",
  USED:      "muted",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
};
const STRIPE: Record<string, string> = {
  VALID: "#22c55e", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

export default function TicketsScreen() {
  const { session } = useAuth();
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!session) return;
    const [{ data: owned }, { data: transferred }] = await Promise.all([
      (supabase as any).from("tickets").select("*, orders!inner(user_id)").eq("orders.user_id", session.user.id).order("created_at", { ascending: false }),
      (supabase as any).from("tickets").select("*").eq("transferred_to_user_id", session.user.id).order("created_at", { ascending: false }),
    ]);
    const merged = [...(owned ?? []), ...(transferred ?? [])];
    const seen = new Set<string>();
    const unique = merged.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTickets(unique as Ticket[]);
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
          <ActivityIndicator size="large" color="#fafafa" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="My Tickets"
      subtitle={`${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}`}
      scroll={false}
      padded={false}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
        showsVerticalScrollIndicator={false}
      >
        {tickets.length === 0 ? (
          <View className="items-center py-20">
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
              <TicketIcon size={24} color="#8f8f8f" strokeWidth={1.75} />
            </View>
            <Text className="text-foreground font-semibold text-lg tracking-tight">No tickets yet</Text>
            <Text className="text-muted-foreground text-sm mt-1 mb-5">Your purchased tickets appear here</Text>
            <Button onPress={() => router.push("/(app)/buy" as never)}>
              <Text>Browse events</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            {tickets.map(item => (
              <PressableScale
                key={item.id}
                onPress={() => router.push(`/(app)/tickets/${item.id}` as never)}
                pressedScale={0.97}
              >
                <Card className="flex-row items-center gap-4 overflow-hidden p-4">
                  {/* status stripe */}
                  <View className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: STRIPE[item.status] ?? "#6b7280" }} />
                  <View className="w-11 h-11 rounded-2xl items-center justify-center border border-border bg-muted ml-1">
                    <TicketIcon size={19} color="#fafafa" strokeWidth={1.75} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-semibold text-base tracking-tight" numberOfLines={1}>
                      {item.ticket_name ?? "Ticket"}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Badge label={item.status} variant={STATUS_VARIANT[item.status] ?? "secondary"} />
                      <Text className="text-muted-foreground text-xs">{formatDate(item.created_at)}</Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#8f8f8f" strokeWidth={1.75} />
                </Card>
              </PressableScale>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
