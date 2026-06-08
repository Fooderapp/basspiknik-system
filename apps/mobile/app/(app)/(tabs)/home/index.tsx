import { useCallback, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CalendarDays, MapPin, Ticket as TicketIcon, ChevronRight, QrCode } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { formatDate } from "@/lib/utils";

interface TicketRow {
  id: string;
  status: string;
  events?: { name: string; venue: string | null; start_date: string; cover_image_url: string | null } | null;
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data: owned }, { data: transferred }] = await Promise.all([
      (supabase as any)
        .from("tickets")
        .select("id, status, orders!inner(user_id), events(name, venue, start_date, cover_image_url)")
        .eq("orders.user_id", session.user.id)
        .eq("status", "VALID"),
      (supabase as any)
        .from("tickets")
        .select("id, status, events(name, venue, start_date, cover_image_url)")
        .eq("transferred_to_user_id", session.user.id)
        .eq("status", "VALID"),
    ]);
    const seen = new Set<string>();
    const merged = [...(owned ?? []), ...(transferred ?? [])].filter((t: TicketRow) =>
      seen.has(t.id) ? false : (seen.add(t.id), true),
    );
    setTickets(merged as TicketRow[]);
  }, [session]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const now = Date.now();
  const upcoming = tickets
    .filter((t) => t.events?.start_date && new Date(t.events.start_date).getTime() >= now)
    .sort((a, b) => new Date(a.events!.start_date).getTime() - new Date(b.events!.start_date).getTime());
  const next = upcoming[0] ?? null;
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
        {/* Greeting */}
        <View className="mb-6">
          <Text className="text-muted-foreground text-sm">Welcome back</Text>
          <Text className="text-foreground text-3xl font-bold tracking-tight">{firstName}</Text>
        </View>

        <Text className="text-muted-foreground text-xs font-semibold tracking-wider mb-2">
          YOUR NEXT EVENT
        </Text>

        {next ? (
          <PressableScale pressedScale={0.97} onPress={() => router.push(`/(app)/tickets/${next.id}` as never)}>
            <Card className="overflow-hidden p-0">
              {next.events?.cover_image_url && (
                <Image source={{ uri: next.events.cover_image_url }} style={{ height: 150, width: "100%" }} resizeMode="cover" />
              )}
              <View className="flex-row items-center gap-4 p-4">
                <View className="w-12 h-12 rounded-xl items-center justify-center bg-gold">
                  <QrCode size={24} color="#323000" strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-bold text-lg tracking-tight" numberOfLines={1}>
                    {next.events?.name ?? "Event"}
                  </Text>
                  <View className="flex-row flex-wrap gap-3 mt-1">
                    <View className="flex-row items-center gap-1">
                      <CalendarDays size={13} color="#9a9a9a" strokeWidth={1.75} />
                      <Text className="text-muted-foreground text-xs">{formatDate(next.events!.start_date)}</Text>
                    </View>
                    {next.events?.venue && (
                      <View className="flex-row items-center gap-1">
                        <MapPin size={13} color="#9a9a9a" strokeWidth={1.75} />
                        <Text className="text-muted-foreground text-xs" numberOfLines={1}>{next.events.venue}</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs font-medium mt-1" style={{ color: "#EBE05A" }}>View ticket →</Text>
                </View>
              </View>
            </Card>
          </PressableScale>
        ) : (
          <View className="items-center rounded-2xl border border-dashed border-border py-12">
            <CalendarDays size={36} color="#555" strokeWidth={1.5} />
            <Text className="text-foreground font-semibold mt-3">No upcoming events</Text>
            <Text className="text-muted-foreground text-sm mt-1">Grab a ticket and it'll show up here.</Text>
            <Button className="mt-5" onPress={() => router.push("/(app)/buy" as never)}>
              <Text>Browse events</Text>
            </Button>
          </View>
        )}

        {/* All tickets shortcut */}
        <PressableScale pressedScale={0.98} onPress={() => router.push("/(app)/tickets" as never)} style={{ marginTop: 16 }}>
          <Card className="flex-row items-center gap-3 p-4">
            <View className="w-10 h-10 rounded-lg items-center justify-center bg-secondary">
              <TicketIcon size={20} color="#f5f5f5" strokeWidth={1.75} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-semibold">All tickets</Text>
              <Text className="text-muted-foreground text-xs">{tickets.length} valid ticket{tickets.length !== 1 ? "s" : ""}</Text>
            </View>
            <ChevronRight size={18} color="#9a9a9a" strokeWidth={1.75} />
          </Card>
        </PressableScale>
      </ScrollView>
    </Screen>
  );
}
