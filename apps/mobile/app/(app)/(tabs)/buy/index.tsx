import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  View,
} from "react-native";
import { router } from "expo-router";
import { CalendarDays, MapPin, ShoppingBag, Tag } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import type { Event, TicketType } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type EventWithTickets = Event & { ticket_types: TicketType[] };

function lowestPrice(types: TicketType[]): number | null {
  const available = types.filter((t) => t.quantity - t.sold > 0);
  if (available.length === 0) return null;
  return Math.min(
    ...available.map((t) =>
      t.sale_enabled && t.sale_price != null ? t.sale_price : t.price
    )
  );
}

function formatPrice(p: number): string {
  return new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency: "HUF",
    maximumFractionDigits: 0,
  }).format(p);
}

export default function BuyTicketsScreen() {
  const [events, setEvents] = useState<EventWithTickets[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const { data } = await (supabase as any)
      .from("events")
      .select("*, ticket_types(*)")
      .eq("status", "PUBLISHED")
      .order("start_date", { ascending: true });
    setEvents((data as EventWithTickets[]) ?? []);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openEvent(id: string) {
    router.push(`/(app)/buy/${id}` as never);
  }

  if (loading) {
    return (
      <Screen title="Buy Tickets">
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#fafafa" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Buy Tickets" subtitle="Upcoming events" scroll={false} padded={false}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />
        }
        ListEmptyComponent={
          <View className="items-center py-20">
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
              <ShoppingBag size={24} color="#8f8f8f" strokeWidth={1.75} />
            </View>
            <Text className="text-foreground font-semibold text-lg tracking-tight">
              No upcoming events
            </Text>
            <Text className="text-muted-foreground text-sm mt-1">
              Check back soon for new events
            </Text>
          </View>
        }
        renderItem={({ item: event }) => {
          const minPrice = lowestPrice(event.ticket_types ?? []);
          const totalSold = (event.ticket_types ?? []).reduce((s, t) => s + t.sold, 0);
          const totalQty = (event.ticket_types ?? []).reduce((s, t) => s + t.quantity, 0);
          const soldOut = totalQty > 0 && totalSold >= totalQty;
          const ticketCount = (event.ticket_types ?? []).length;

          return (
            <PressableScale
              onPress={() => openEvent(event.id)}
              style={{ marginBottom: 12 }}
              disabled={soldOut}
              pressedScale={0.97}
            >
              <Card className="overflow-hidden p-0">
                {/* Cover image */}
                {event.cover_image_url ? (
                  <Image
                    source={{ uri: event.cover_image_url }}
                    className="w-full"
                    style={{ height: 160 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    className="w-full bg-muted items-center justify-center"
                    style={{ height: 100 }}
                  >
                    <ShoppingBag size={32} color="#3f3f3f" strokeWidth={1.5} />
                  </View>
                )}

                <View className="p-4 gap-3">
                  {/* Name + sold-out badge */}
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className="text-foreground font-bold text-lg tracking-tight flex-1"
                      numberOfLines={2}
                    >
                      {event.name}
                    </Text>
                    {soldOut && <Badge label="Sold out" variant="destructive" />}
                  </View>

                  {/* Date */}
                  <View className="flex-row items-center gap-1.5">
                    <CalendarDays size={14} color="#8f8f8f" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-sm">
                      {formatDate(event.start_date)}
                      {event.end_date ? ` — ${formatDate(event.end_date)}` : ""}
                    </Text>
                  </View>

                  {/* Venue */}
                  {event.venue && (
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={14} color="#8f8f8f" strokeWidth={1.75} />
                      <Text className="text-muted-foreground text-sm" numberOfLines={1}>
                        {event.venue}
                        {event.address ? `, ${event.address}` : ""}
                      </Text>
                    </View>
                  )}

                  <Separator />

                  {/* Price + ticket count */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <Tag size={14} color="#8f8f8f" strokeWidth={1.75} />
                      <Text className="text-muted-foreground text-sm">
                        {ticketCount} ticket type{ticketCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    {minPrice != null && (
                      <Text className="text-foreground font-semibold text-sm">
                        from {formatPrice(minPrice)}
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            </PressableScale>
          );
        }}
      />
    </Screen>
  );
}
