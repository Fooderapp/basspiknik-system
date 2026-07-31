import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ShoppingBag } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/context/language";
import { t } from "@/lib/i18n";
import type { Event, TicketType } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { imgUri, IMG } from "@/lib/image";

const W = Dimensions.get("window").width;
const CARD_H = (W - 40) * (5 / 4); // 4:5 aspect ratio matching web

// Brand tokens
const INK  = "#16170F";
const LIME = "#C7E04A";

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

// ─── Web-style tall event card ────────────────────────────────────────────────
function EventCard({ event, onPress, dict }: { event: EventWithTickets; onPress: () => void; dict: import("@/lib/i18n").Dictionary }) {
  const minPrice = lowestPrice(event.ticket_types ?? []);
  const totalSold = (event.ticket_types ?? []).reduce((s, t) => s + t.sold, 0);
  const totalQty  = (event.ticket_types ?? []).reduce((s, t) => s + t.quantity, 0);
  const soldOut   = totalQty > 0 && totalSold >= totalQty;
  const soon      = !soldOut && (minPrice === null || (event as any).status === "PREORDER");
  const badge     = soon || soldOut ? null : formatDate(event.start_date);

  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.97}
      disabled={soldOut}
      style={{ marginBottom: 16 }}
    >
      {/* Card shell — rounded-[2.25rem] matches web's 36px radius */}
      <View style={{ height: CARD_H, borderRadius: 36, overflow: "hidden", backgroundColor: INK }}>
        {/* Cover image */}
        {event.cover_image_url
          ? <Image source={{ uri: imgUri(event.cover_image_url, IMG.card) }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
          : <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#3C7A1E" }} />}

        {/* Gradient overlay — smooth dark at bottom, transparent at top */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.72)", "rgba(0,0,0,0.88)"]}
          locations={[0, 0.3, 0.7, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CARD_H * 0.72 }}
        />

        {/* Content pinned to bottom */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 32, alignItems: "center", gap: 16 }}>
          {/* Date badge */}
          {badge && (
            <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                {badge}
              </Text>
            </View>
          )}

          {/* Event name */}
          <Text
            style={{ color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: -0.8, textTransform: "uppercase", lineHeight: 28, textAlign: "center" }}
            numberOfLines={2}
          >
            {event.name}
          </Text>

          {/* CTA pill */}
          {soldOut ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600" }}>{dict["buy.sold_out"]}</Text>
            </View>
          ) : soon ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" }}>{dict["buy.coming_soon"]}</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}>
              <Text style={{ color: INK, fontSize: 14, fontWeight: "700" }}>
                {minPrice != null ? t(dict, "buy.from_price", { price: formatPrice(minPrice) }) : dict["buy.buy_tickets"]}
              </Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function BuyTicketsScreen() {
  const { dict } = useLanguage();
  const [events, setEvents] = useState<EventWithTickets[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const { data } = await (supabase as any)
      .from("events")
      .select("*, ticket_types(*)")
      .in("status", ["PUBLISHED", "PREORDER"])
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

  if (loading) {
    return (
      <Screen title={dict["buy.title"]}>
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color={INK} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={dict["buy.title"]} subtitle={dict["buy.subtitle"]} scroll={false} padded={false}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK} />
        }
        ListEmptyComponent={
          <View className="items-center py-20">
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 16, backgroundColor: `${LIME}30` }}>
              <ShoppingBag size={24} color={INK} strokeWidth={1.75} />
            </View>
            <Text style={{ color: INK, fontWeight: "800", fontSize: 18, letterSpacing: -0.5 }}>
              {dict["buy.no_events"]}
            </Text>
            <Text style={{ color: "#6B6F63", fontSize: 14, marginTop: 4 }}>
              {dict["buy.no_events_sub"]}
            </Text>
          </View>
        }
        renderItem={({ item: event }) => (
          <EventCard
            event={event}
            dict={dict}
            onPress={() => router.push(`/(app)/buy/${event.id}` as never)}
          />
        )}
      />
    </Screen>
  );
}
