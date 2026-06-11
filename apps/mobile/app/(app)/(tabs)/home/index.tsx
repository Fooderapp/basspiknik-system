import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Dimensions, Image, Linking, NativeScrollEvent,
  NativeSyntheticEvent, Platform, Pressable, RefreshControl, ScrollView, View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CalendarDays, MapPin, Star, ShoppingBag, Wine, Sparkles, QrCode, Bell, User,
  Ticket as TicketIcon, ChevronRight, type LucideIcon,
} from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { QRImage } from "@/components/ui/QRImage";
import { AppleLogo, GoogleLogo } from "@/components/ui/BrandLogos";
import { TaskList } from "@/components/consumer/TaskList";
import { TiltCard } from "@/components/ui/TiltCard";
import { ActionCard } from "@/components/ui/ActionCard";
import { IconButton } from "@/components/ui/IconButton";
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
  const insets = useSafeAreaInsets();
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#F6F5EE" }}>
        <ActivityIndicator size="large" color="#163300" />
      </View>
    );
  }

  const activeTicket = tickets[active] ?? null;

  return (
    <View className="flex-1" style={{ backgroundColor: "#F6F5EE", paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#163300" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting + credit chip + bell */}
        <View className="px-5 pt-2 mb-5 flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text style={{ color: "#6B6F63", fontSize: 14, fontWeight: "600" }}>Welcome back</Text>
            <Text style={{ color: "#14160F", fontSize: 34, fontWeight: "800", letterSpacing: -1, marginTop: 2 }} numberOfLines={1}>
              Hi {firstName} 👋
            </Text>
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <PressableScale pressedScale={0.94} onPress={() => router.push("/(app)/buy" as never)}>
              <View className="flex-row items-center gap-1.5 rounded-full px-3.5" style={{ height: 40, backgroundColor: "#fff", shadowColor: "#14160F", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
                <Star size={14} color="#163300" strokeWidth={2.5} fill="#9FE870" />
                <Text style={{ color: "#14160F", fontWeight: "800", fontSize: 14 }}>{credits}</Text>
              </View>
            </PressableScale>
            <IconButton icon={Bell} variant="white" size={40} onPress={() => router.push("/(app)/(tabs)/profile" as never)} />
          </View>
        </View>

        {/* Quick actions — 2×2 pastel grid (matches the mock) */}
        <View className="px-5 mb-7">
          <View className="flex-row gap-3 mb-3">
            <ActionCard style={{ flex: 1 }} tone="gold" icon={ShoppingBag} title="Buy tickets" subtitle="Upcoming events" onPress={() => router.push("/(app)/buy" as never)} />
            <ActionCard style={{ flex: 1 }} tone="green" icon={Wine} title="Order at bar" subtitle="Drinks & menu" onPress={() => router.push("/(app)/(tabs)/menu" as never)} />
          </View>
          <View className="flex-row gap-3">
            <ActionCard style={{ flex: 1 }} tone="sky" icon={TicketIcon} title="My tickets" subtitle="Wallet & passes" onPress={() => router.push("/(app)/(tabs)/tickets" as never)} />
            <ActionCard style={{ flex: 1 }} tone="lavender" icon={User} title="Profile" subtitle="Account & perks" onPress={() => router.push("/(app)/(tabs)/profile" as never)} />
          </View>
        </View>

        {/* Tickets */}
        {tickets.length === 0 ? (
          <View className="px-5">
            <View className="items-center rounded-3xl py-12" style={{ backgroundColor: "#fff", shadowColor: "#14160F", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF2C6" }}>
                <ShoppingBag size={26} color="#2C3A18" strokeWidth={1.75} />
              </View>
              <Text style={{ color: "#14160F", fontWeight: "700", marginTop: 12 }}>No tickets yet</Text>
              <Text style={{ color: "#6B6F63", fontSize: 13, marginTop: 4 }}>Grab a ticket and it'll show up here.</Text>
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
                onPress={() => router.push("/(app)/(tabs)/tickets" as never)}
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
                  backgroundColor: i === active ? "#163300" : "rgba(20,22,15,0.18)",
                }} />
              ))}
            </View>

            {/* Wallet buttons — profile-level wallet pass (Apple on iOS, Google everywhere) */}
            {!!process.env.EXPO_PUBLIC_APP_URL && (
              <View className="px-5 mt-4 gap-2">
                {Platform.OS === "ios" && (
                  <PressableScale
                    pressedScale={0.97}
                    onPress={() => {
                      const base = process.env.EXPO_PUBLIC_APP_URL!;
                      const tok = session?.access_token ?? "";
                      Linking.openURL(`${base}/api/wallet?token=${encodeURIComponent(tok)}`).catch(() => {});
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "center",
                      gap: 8, borderRadius: 16, paddingVertical: 14, backgroundColor: "#16170F",
                    }}
                  >
                    <AppleLogo size={18} color="#fff" />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>
                      Add to Apple Wallet
                    </Text>
                  </PressableScale>
                )}
                <PressableScale
                  pressedScale={0.97}
                  onPress={() => {
                    const base = process.env.EXPO_PUBLIC_APP_URL!;
                    const tok = session?.access_token ?? "";
                    Linking.openURL(`${base}/api/google-wallet?token=${encodeURIComponent(tok)}`).catch(() => {});
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "center",
                    gap: 8, borderWidth: 1, borderColor: "#E2E0D4",
                    borderRadius: 16, paddingVertical: 14, backgroundColor: "#fff",
                  }}
                >
                  <GoogleLogo size={18} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#14160F" }}>
                    Add to Google Wallet
                  </Text>
                </PressableScale>
              </View>
            )}
          </>
        )}

        {/* Earn-credits tasks */}
        <TaskList />

        {/* Recent activity */}
        {acts.length > 0 && (
          <View className="px-5 mt-10">
            <Text style={{ color: "#14160F", fontSize: 18, fontWeight: "800", letterSpacing: -0.4, marginBottom: 12 }}>Recent activity</Text>
            <View style={{ backgroundColor: "#fff", borderRadius: 24, overflow: "hidden", shadowColor: "#14160F", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
              {acts.map((a, i) => {
                const Icon = actIcon[a.kind];
                return (
                  <View key={a.id} className="flex-row items-center gap-3 p-3.5" style={i > 0 ? { borderTopWidth: 1, borderTopColor: "#F0EEE3" } : undefined}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#ECEADD" }}>
                      <Icon size={18} color="#14160F" strokeWidth={1.75} />
                    </View>
                    <View className="flex-1">
                      <Text style={{ color: "#14160F", fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{a.label}</Text>
                      {a.sub && <Text style={{ color: "#6B6F63", fontSize: 12 }} numberOfLines={1}>{a.sub}</Text>}
                    </View>
                    {a.amount && (
                      <Text style={{ fontSize: 14, fontWeight: "700", color: a.positive ? "#3E7B12" : "#14160F" }}>
                        {a.amount}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
