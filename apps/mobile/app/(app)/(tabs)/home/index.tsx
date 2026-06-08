import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CalendarDays, MapPin, Ticket as TicketIcon, ChevronRight, Star, Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { formatDate } from "@/lib/utils";

interface TicketRow {
  id: string;
  status: string;
  ticket_name: string | null;
  events?: { name: string; venue: string | null; start_date: string } | null;
}

const STRIPE: Record<string, string> = {
  VALID: "#9FE870", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data: owned }, { data: transferred }, { data: bal }] = await Promise.all([
      (supabase as any)
        .from("tickets")
        .select("id, status, ticket_name, orders!inner(user_id), events(name, venue, start_date)")
        .eq("orders.user_id", session.user.id)
        .eq("status", "VALID"),
      (supabase as any)
        .from("tickets")
        .select("id, status, ticket_name, events(name, venue, start_date)")
        .eq("transferred_to_user_id", session.user.id)
        .eq("status", "VALID"),
      (supabase as any).rpc("get_credit_balance", { p_user_id: session.user.id }),
    ]);
    const seen = new Set<string>();
    const merged = [...(owned ?? []), ...(transferred ?? [])]
      .filter((t: TicketRow) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
      .sort((a: TicketRow, b: TicketRow) => {
        const ad = a.events?.start_date ? new Date(a.events.start_date).getTime() : Infinity;
        const bd = b.events?.start_date ? new Date(b.events.start_date).getTime() : Infinity;
        return ad - bd;
      });
    setTickets(merged as TicketRow[]);
    setCredits(typeof bal === "number" ? bal : 0);
  }, [session]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const firstName = (profile?.name ?? session?.user.email ?? "").split(/[ @]/)[0];

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#EBE05A" />
      </View>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EBE05A" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting + small credit chip */}
        <View className="mb-6 flex-row items-start justify-between">
          <View>
            <Text className="text-muted-foreground text-sm">Welcome back</Text>
            <Text className="text-foreground text-3xl font-bold tracking-tight">{firstName}</Text>
          </View>
          <PressableScale pressedScale={0.94} onPress={() => router.push("/(app)/buy" as never)}>
            <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ borderWidth: 1, borderColor: "rgba(235,224,90,0.4)", backgroundColor: "rgba(235,224,90,0.1)" }}>
              <Star size={13} color="#EBE05A" strokeWidth={2} fill="#EBE05A" />
              <Text className="font-semibold text-sm" style={{ color: "#EBE05A" }}>{credits}</Text>
            </View>
          </PressableScale>
        </View>

        {/* Tickets — primary focus */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-foreground text-lg font-bold tracking-tight">Tickets</Text>
          <PressableScale onPress={() => router.push("/(app)/tickets" as never)}>
            <Text className="text-muted-foreground text-xs font-medium">All tickets →</Text>
          </PressableScale>
        </View>

        {tickets.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-border py-12">
            <TicketIcon size={36} color="#555" strokeWidth={1.5} />
            <Text className="text-foreground font-semibold mt-3">No tickets yet</Text>
            <Text className="text-muted-foreground text-sm mt-1">Grab a ticket and it'll show up here.</Text>
            <Button className="mt-5" onPress={() => router.push("/(app)/buy" as never)}>
              <Text>Browse events</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            {tickets.map((tk) => (
              <PressableScale key={tk.id} pressedScale={0.97} onPress={() => router.push(`/(app)/tickets/${tk.id}` as never)}>
                <Card className="flex-row items-center gap-4 overflow-hidden p-4">
                  <View className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: STRIPE[tk.status] ?? "#6b7280" }} />
                  <View className="ml-1 w-11 h-11 rounded-2xl items-center justify-center border border-border bg-secondary">
                    <TicketIcon size={19} color="#f5f5f5" strokeWidth={1.75} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-semibold tracking-tight" numberOfLines={1}>
                      {tk.events?.name ?? tk.ticket_name ?? "Ticket"}
                    </Text>
                    <View className="flex-row flex-wrap items-center gap-2 mt-1">
                      <Badge label="Valid" variant="success" />
                      {tk.events?.start_date && (
                        <View className="flex-row items-center gap-1">
                          <CalendarDays size={12} color="#9a9a9a" strokeWidth={1.75} />
                          <Text className="text-muted-foreground text-xs">{formatDate(tk.events.start_date)}</Text>
                        </View>
                      )}
                      {tk.events?.venue && (
                        <View className="flex-row items-center gap-1">
                          <MapPin size={12} color="#9a9a9a" strokeWidth={1.75} />
                          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{tk.events.venue}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <ChevronRight size={18} color="#9a9a9a" strokeWidth={1.75} />
                </Card>
              </PressableScale>
            ))}

            <Button variant="outline" className="mt-1" onPress={() => router.push("/(app)/buy" as never)} icon={<Plus size={16} color="#f5f5f5" strokeWidth={2} />}>
              <Text>Browse events</Text>
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
