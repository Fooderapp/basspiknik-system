import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Dimensions, Image, Linking, NativeScrollEvent,
  NativeSyntheticEvent, Platform, Pressable, RefreshControl, ScrollView, View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import {
  CalendarDays, MapPin, Star, ShoppingBag, Wine, Sparkles, QrCode,
  Ticket as TicketIcon, ChevronRight, type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { QRImage } from "@/components/ui/QRImage";
import { TiltCard } from "@/components/ui/TiltCard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { formatCurrency, formatDate } from "@/lib/utils";

const W = Dimensions.get("window").width;
const CARD_W = W - 40;
const GAP = 16;
const STATUS: Record<string, string> = {
  VALID: "#9FE870", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

const MAX_CARDS = 8;

interface WTicket {
  id: string; status: string; ticket_name: string | null; tier: string | null;
  order_id: string; qr_code: string; created_at: string | null;
  events?: { name: string; venue: string | null; start_date: string; cover_image_url: string | null; banner_image_url: string | null } | null;
  ticket_types?: { image_url: string | null } | null;
}
interface Act {
  id: string; kind: "buy" | "won" | "bar" | "credit";
  label: string; sub: string | null; amount: string | null; positive: boolean; at: number;
}

// ─── Flippable ticket card ────────────────────────────────────────────────────
function FlipCard({
  tk, idx, total, isLast,
}: { tk: WTicket; idx: number; total: number; isLast: boolean }) {
  const flip = useSharedValue(0); // 0 = front, 1 = back
  const flipped = useRef(false);

  const frontAnim = useAnimatedStyle(() => ({
    backfaceVisibility: "hidden",
    transform: [
      { perspective: 1400 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  const backAnim = useAnimatedStyle(() => ({
    position: "absolute" as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backfaceVisibility: "hidden",
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    transform: [
      { perspective: 1400 },
      { rotateY: `${interpolate(flip.value, [0, 1], [-180, 0])}deg` },
    ],
  }));

  function toggle() {
    flipped.current = !flipped.current;
    flip.value = withTiming(flipped.current ? 1 : 0, { duration: 480, easing: Easing.out(Easing.cubic) });
  }

  return (
    <TiltCard
      gyro
      pan={false}
      maxTilt={5}
      holo
      surface="#1f1f1f"
      radius={20}
      style={{ width: CARD_W, marginRight: isLast ? 0 : GAP }}
    >
      <Pressable onPress={toggle} android_ripple={null}>
        {/* ── FRONT FACE ── */}
        <Animated.View style={frontAnim} shouldRasterizeIOS renderToHardwareTextureAndroid>
          <Card className="overflow-hidden p-0" style={{ borderRadius: 20 }}>
            {/* Banner (4:1) / cover + pocket notch — 4:1 box so a 480×120 image fills exactly */}
            <View style={{ height: CARD_W / 4 }} className="bg-secondary overflow-hidden">
              {(tk.ticket_types?.image_url || tk.events?.banner_image_url || tk.events?.cover_image_url)
                ? <Image source={{ uri: (tk.ticket_types?.image_url ?? tk.events?.banner_image_url ?? tk.events?.cover_image_url)! }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                : <View style={{ flex: 1, backgroundColor: "rgba(235,224,90,0.18)" }} />}
            </View>

            <View className="p-5">
              <Text className="text-foreground text-xl font-bold tracking-tight" numberOfLines={1}>
                {tk.events?.name ?? tk.ticket_name ?? "Ticket"}
              </Text>
              <View className="flex-row flex-wrap gap-3 mt-1">
                {tk.events?.start_date && (
                  <View className="flex-row items-center gap-1">
                    <CalendarDays size={13} color="#9a9a9a" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-xs">{formatDate(tk.events.start_date)}</Text>
                  </View>
                )}
                {tk.events?.venue && (
                  <View className="flex-row items-center gap-1">
                    <MapPin size={13} color="#9a9a9a" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-xs" numberOfLines={1}>{tk.events.venue}</Text>
                  </View>
                )}
              </View>

              <View className="flex-row items-center gap-4 mt-4">
                <View className="bg-white rounded-xl p-2">
                  <QRImage value={tk.qr_code} size={76} />
                </View>
                <View className="flex-1">
                  <Badge label={tk.status === "USED" ? "Used" : "Valid"} variant={tk.status === "USED" ? "secondary" : "success"} />
                  <Text className="text-foreground text-sm font-medium mt-1" numberOfLines={1}>
                    {tk.ticket_name ?? "Ticket"}
                  </Text>
                  <Text className="text-muted-foreground text-xs">{idx} / {total}</Text>
                  <View className="flex-row items-center gap-1 mt-2">
                    <QrCode size={12} color="#9a9a9a" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-[11px]">Tap to show QR</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Status bar — bottom, coloured by state */}
            <View style={{
              position: "absolute", left: 0, right: 0, bottom: 0, height: 4,
              backgroundColor: STATUS[tk.status] ?? "#6b7280",
            }} />
          </Card>
        </Animated.View>

        {/* ── BACK FACE — QR only ── */}
        <Animated.View style={backAnim} shouldRasterizeIOS renderToHardwareTextureAndroid>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{
              backgroundColor: "#ffffff", borderRadius: 20, padding: 16,
              shadowColor: "#EBE05A", shadowOpacity: 0.25, shadowRadius: 20,
              shadowOffset: { width: 0, height: 0 },
            }}>
              <QRImage value={tk.qr_code} size={180} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </TiltCard>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { session, profile } = useAuth();
  const [tickets, setTickets] = useState<WTicket[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number }>>({});
  const [acts, setActs] = useState<Act[]>([]);
  const [credits, setCredits] = useState(0);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const [
      { data: owned }, { data: transferred }, { data: bal },
      { data: orders }, { data: drinks }, { data: creds },
    ] = await Promise.all([
      (supabase as any).from("tickets")
        .select("id, status, ticket_name, tier, order_id, qr_code, created_at, orders!inner(user_id), events(name, venue, start_date, cover_image_url, banner_image_url), ticket_types(image_url)")
        .eq("orders.user_id", uid).in("status", ["VALID", "USED"]),
      (supabase as any).from("tickets")
        .select("id, status, ticket_name, tier, order_id, qr_code, created_at, events(name, venue, start_date, cover_image_url, banner_image_url), ticket_types(image_url)")
        .eq("transferred_to_user_id", uid).in("status", ["VALID", "USED"]),
      (supabase as any).rpc("get_credit_balance", { p_user_id: uid }),
      (supabase as any).from("orders").select("id, total, created_at, events(name)")
        .eq("user_id", uid).eq("status", "PAID").order("created_at", { ascending: false }).limit(5),
      (supabase as any).from("drink_orders").select("id, total, created_at")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
      (supabase as any).from("credit_transactions").select("id, amount, reason, created_at")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
    ]);

    const seen = new Set<string>();
    const raw = [...(owned ?? []), ...(transferred ?? [])].filter((t: WTicket) =>
      seen.has(t.id) ? false : (seen.add(t.id), true),
    );
    const cmap: Record<string, { total: number }> = {};
    for (const t of raw) cmap[t.order_id] = { total: (cmap[t.order_id]?.total ?? 0) + 1 };
    raw.sort((a: WTicket, b: WTicket) => {
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad; // newest purchase first
    });
    // If every ticket has been scanned (USED), only keep the most recent one in the wallet
    const allCheckedIn = raw.length > 0 && raw.every((t: WTicket) => t.status === "USED");
    setTickets(allCheckedIn ? [raw[0]] : (raw as WTicket[]));
    setCounts(cmap);
    setCredits(typeof bal === "number" ? bal : 0);

    const fmt = (n: number) => formatCurrency(n, "HUF");
    const list: Act[] = [];
    for (const o of orders ?? []) {
      const free = (o.total ?? 0) <= 0;
      list.push({ id: `o-${o.id}`, kind: free ? "won" : "buy", label: free ? "Free tickets won" : "Tickets purchased", sub: o.events?.name ?? null, amount: free ? null : fmt(o.total), positive: false, at: new Date(o.created_at).getTime() });
    }
    for (const d of drinks ?? []) {
      list.push({ id: `d-${d.id}`, kind: "bar", label: "Bar order", sub: null, amount: d.total ? fmt(d.total) : null, positive: false, at: new Date(d.created_at).getTime() });
    }
    for (const c of creds ?? []) {
      const pos = c.amount >= 0;
      list.push({ id: `c-${c.id}`, kind: "credit", label: pos ? "Credits earned" : "Credits spent", sub: null, amount: `${pos ? "+" : ""}${c.amount} credits`, positive: pos, at: new Date(c.created_at).getTime() });
    }
    list.sort((a, b) => b.at - a.at);
    setActs(list.slice(0, 5));
  }, [session]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + GAP));
    if (i !== active) setActive(i);
  }

  const firstName = (profile?.name ?? session?.user.email ?? "").split(/[ @]/)[0];
  const orderSeen: Record<string, number> = {};
  const actIcon: Record<Act["kind"], LucideIcon> = { bar: Wine, credit: Sparkles, won: Star, buy: ShoppingBag };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#EBE05A" />
      </View>
    );
  }

  const activeTicket = tickets[active] ?? null;

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EBE05A" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting + credit chip */}
        <View className="px-5 mb-6 flex-row items-start justify-between">
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

        {/* Tickets */}
        {tickets.length === 0 ? (
          <View className="px-5">
            <View className="items-center rounded-2xl border border-dashed border-border py-12">
              <ShoppingBag size={36} color="#555" strokeWidth={1.5} />
              <Text className="text-foreground font-semibold mt-3">No tickets yet</Text>
              <Text className="text-muted-foreground text-sm mt-1">Grab a ticket and it'll show up here.</Text>
            </View>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_W + GAP}
              decelerationRate="fast"
              snapToAlignment="start"
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: 20 }}
            >
              {tickets.slice(0, MAX_CARDS).map((tk) => {
                const idx = (orderSeen[tk.order_id] ?? 0) + 1;
                orderSeen[tk.order_id] = idx;
                const total = counts[tk.order_id]?.total ?? 1;
                return (
                  <FlipCard
                    key={tk.id}
                    tk={tk}
                    idx={idx}
                    total={total}
                    isLast={false}
                  />
                );
              })}

              {/* Final CTA card → My Tickets */}
              <PressableScale
                pressedScale={0.98}
                onPress={() => router.push("/(app)/tickets" as never)}
                style={{ width: CARD_W }}
              >
                <View
                  style={{ minHeight: 260, borderRadius: 20, borderWidth: 1, borderColor: "#303030", borderStyle: "dashed" }}
                  className="items-center justify-center gap-3 bg-card/50 p-8"
                >
                  <View className="w-14 h-14 rounded-full items-center justify-center bg-secondary">
                    <TicketIcon size={24} color="#EBE05A" strokeWidth={1.75} />
                  </View>
                  <Text className="text-foreground font-semibold">
                    {tickets.length > MAX_CARDS ? `All ${tickets.length} tickets` : "My Tickets"}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-muted-foreground text-sm">View all</Text>
                    <ChevronRight size={16} color="#9a9a9a" strokeWidth={1.75} />
                  </View>
                </View>
              </PressableScale>
            </ScrollView>

            {/* Dot nav — shown cards + 1 CTA */}
            <View className="flex-row justify-center gap-1.5 mt-3">
              {Array.from({ length: Math.min(tickets.length, MAX_CARDS) + 1 }).map((_, i) => (
                <View key={i} style={{
                  height: 6, borderRadius: 999,
                  width: i === active ? 20 : 6,
                  backgroundColor: i === active ? "#EBE05A" : "rgba(154,154,154,0.4)",
                }} />
              ))}
            </View>

            {/* Wallet button — iOS only (profile-level Apple Wallet pass) */}
            {Platform.OS === "ios" && !!process.env.EXPO_PUBLIC_APP_URL && (
              <View className="px-5 mt-4">
                <PressableScale
                  pressedScale={0.97}
                  onPress={() => {
                    const base = process.env.EXPO_PUBLIC_APP_URL!;
                    const tok = session?.access_token ?? "";
                    // /api/wallet = existing working Apple Wallet pass endpoint
                    const endpoint = `${base}/api/wallet?token=${encodeURIComponent(tok)}`;
                    Linking.openURL(endpoint).catch(() => {});
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "center",
                    gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: 14, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.04)",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#f5f5f5" }}>
                    Add to Apple Wallet
                  </Text>
                </PressableScale>
              </View>
            )}
          </>
        )}

        {/* Recent activity */}
        {acts.length > 0 && (
          <View className="px-5 mt-10">
            <Text className="text-foreground text-lg font-bold tracking-tight mb-3">Recent activity</Text>
            <Card className="p-0 overflow-hidden">
              {acts.map((a, i) => {
                const Icon = actIcon[a.kind];
                return (
                  <View key={a.id} className={`flex-row items-center gap-3 p-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <View className="w-9 h-9 rounded-full items-center justify-center bg-secondary">
                      <Icon size={18} color="#f5f5f5" strokeWidth={1.75} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground text-sm font-medium" numberOfLines={1}>{a.label}</Text>
                      {a.sub && <Text className="text-muted-foreground text-xs" numberOfLines={1}>{a.sub}</Text>}
                    </View>
                    {a.amount && (
                      <Text className="text-sm font-semibold" style={{ color: a.positive ? "#9FE870" : "#f5f5f5" }}>
                        {a.amount}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
