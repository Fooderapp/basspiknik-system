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
  CalendarDays, MapPin, Star, ShoppingBag, Wine, Sparkles, QrCode, ScanLine,
  Ticket as TicketIcon, ChevronRight, type LucideIcon,
} from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { QRImage } from "@/components/ui/QRImage";
import { AppleLogo, GoogleLogo } from "@/components/ui/BrandLogos";
import { TiltCard } from "@/components/ui/TiltCard";
import { IconButton } from "@/components/ui/IconButton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { formatCurrency, formatDate } from "@/lib/utils";

const W = Dimensions.get("window").width;
const CARD_W = W - 40;
const GAP = 16;
const EVENT_CARD_W = W * 0.78;
const ARTIST_CARD_W = 130;

const DARK = "#16170F";
const BG = "#F6F5EE";
const GREEN = "#3C7A1E";

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
interface EventRow {
  id: string; name: string; slug: string | null; start_date: string;
  venue: string | null; cover_image_url: string | null;
  soon: boolean; from: number | null;
}
interface ArtistRow {
  id: string; name: string; genre: string | null; photo_url: string | null;
}
interface Act {
  id: string; kind: "buy" | "won" | "bar" | "credit";
  label: string; sub: string | null; amount: string | null; positive: boolean; at: number;
}

// ─── Flip ticket card ─────────────────────────────────────────────────────────
function FlipCard({ tk, idx, total }: { tk: WTicket; idx: number; total: number }) {
  const flip = useSharedValue(0);
  const flipped = useRef(false);

  const frontAnim = useAnimatedStyle(() => ({
    backfaceVisibility: "hidden",
    transform: [{ perspective: 1400 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const backAnim = useAnimatedStyle(() => ({
    position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0,
    backfaceVisibility: "hidden", borderRadius: 20, backgroundColor: "#FFFFFF",
    transform: [{ perspective: 1400 }, { rotateY: `${interpolate(flip.value, [0, 1], [-180, 0])}deg` }],
  }));

  function toggle() {
    flipped.current = !flipped.current;
    flip.value = withTiming(flipped.current ? 1 : 0, { duration: 480, easing: Easing.out(Easing.cubic) });
  }

  return (
    <TiltCard gyro pan={false} maxTilt={5} holo surface="#FFFFFF" radius={20}
      style={{ width: CARD_W, marginRight: GAP }}>
      <Pressable onPress={toggle} android_ripple={null}>
        <Animated.View style={frontAnim} shouldRasterizeIOS renderToHardwareTextureAndroid>
          <Card className="overflow-hidden p-0" style={{ borderRadius: 20 }}>
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
                  <Text className="text-foreground text-sm font-medium mt-1" numberOfLines={1}>{tk.ticket_name ?? "Ticket"}</Text>
                  <Text className="text-muted-foreground text-xs">{idx} / {total}</Text>
                  <View className="flex-row items-center gap-1 mt-2">
                    <QrCode size={12} color="#9a9a9a" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-[11px]">Tap to show QR</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: STATUS[tk.status] ?? "#6b7280" }} />
          </Card>
        </Animated.View>
        <Animated.View style={backAnim} shouldRasterizeIOS renderToHardwareTextureAndroid>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ backgroundColor: "#ffffff", borderRadius: 20, padding: 16, shadowColor: "#EBE05A", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } }}>
              <QRImage value={tk.qr_code} size={180} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </TiltCard>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────
function EventCard({ ev }: { ev: EventRow }) {
  return (
    <PressableScale pressedScale={0.97} onPress={() => {}} style={{ width: EVENT_CARD_W, marginRight: GAP }}>
      <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: DARK }}>
        {ev.cover_image_url
          ? <Image source={{ uri: ev.cover_image_url }} style={{ width: "100%", height: EVENT_CARD_W * 0.6 }} resizeMode="cover" />
          : <View style={{ width: "100%", height: EVENT_CARD_W * 0.6, backgroundColor: GREEN }} />}
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.5 }} numberOfLines={2}>{ev.name}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {ev.start_date && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <CalendarDays size={12} color="rgba(255,255,255,0.55)" strokeWidth={1.75} />
                <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{formatDate(ev.start_date)}</Text>
              </View>
            )}
            {ev.venue && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={12} color="rgba(255,255,255,0.55)" strokeWidth={1.75} />
                <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }} numberOfLines={1}>{ev.venue}</Text>
              </View>
            )}
          </View>
          <View style={{ marginTop: 12 }}>
            {ev.soon
              ? <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" }}>Hamarosan</Text>
                </View>
              : ev.from != null
                ? <View style={{ alignSelf: "flex-start", backgroundColor: "#C7E04A", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <Text style={{ color: DARK, fontSize: 12, fontWeight: "800" }}>
                      {formatCurrency(ev.from, "HUF")}-tól
                    </Text>
                  </View>
                : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// ─── Artist card ──────────────────────────────────────────────────────────────
function ArtistCard({ artist }: { artist: ArtistRow }) {
  return (
    <View style={{ width: ARTIST_CARD_W, marginRight: 12 }}>
      <View style={{ width: ARTIST_CARD_W, height: ARTIST_CARD_W, borderRadius: 16, overflow: "hidden", backgroundColor: "#E8E6DA" }}>
        {artist.photo_url
          ? <Image source={{ uri: artist.photo_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 36, fontWeight: "800", color: "rgba(20,22,15,0.18)" }}>
                {artist.name.charAt(0)}
              </Text>
            </View>}
      </View>
      <Text style={{ color: DARK, fontSize: 13, fontWeight: "700", marginTop: 8, letterSpacing: -0.3 }} numberOfLines={1}>{artist.name}</Text>
      {artist.genre && <Text style={{ color: "#6B6F63", fontSize: 11, marginTop: 2 }} numberOfLines={1}>{artist.genre}</Text>}
    </View>
  );
}

// ─── Section heading ─────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ color: DARK, fontSize: 38, fontWeight: "900", letterSpacing: -1.5, textTransform: "uppercase", lineHeight: 42, marginBottom: 16 }}>
      {children}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { session, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<WTicket[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number }>>({});
  const [events, setEvents] = useState<EventRow[]>([]);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [credits, setCredits] = useState(0);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const uid = session?.user.id;
    const publicQueries = await Promise.all([
      (supabase as any).from("events")
        .select("id, name, slug, start_date, venue, cover_image_url, ticket_types(quantity, sold, is_visible, sale_enabled, sale_price, price)")
        .eq("status", "PUBLISHED").order("start_date"),
      (supabase as any).from("artists")
        .select("id, name, genre, photo_url").eq("active", true).order("sort_order").order("name"),
    ]);

    const [{ data: evData }, { data: artistData }] = publicQueries;

    const parsedEvents: EventRow[] = (evData ?? []).map((ev: any) => {
      const types = (ev.ticket_types ?? []).filter((tt: any) => tt.is_visible !== false);
      const available = types.filter((tt: any) => tt.quantity - tt.sold > 0);
      if (available.length === 0) return { ...ev, soon: true, from: null };
      const from = Math.min(...available.map((tt: any) => (tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price)));
      return { ...ev, soon: false, from };
    });
    setEvents(parsedEvents);
    setArtists(artistData ?? []);

    if (!uid) return;

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
      return bd - ad;
    });
    const allCheckedIn = raw.length > 0 && raw.every((t: WTicket) => t.status === "USED");
    setTickets(allCheckedIn ? [raw[0]] : (raw as WTicket[]));
    setCounts(cmap);
    setCredits(typeof bal === "number" ? bal : 0);

    const fmt = (n: number) => formatCurrency(n, "HUF");
    const list: Act[] = [];
    for (const o of orders ?? []) {
      const free = (o.total ?? 0) <= 0;
      list.push({ id: `o-${o.id}`, kind: free ? "won" : "buy", label: free ? "Ingyenes jegyek" : "Jegyvásárlás", sub: o.events?.name ?? null, amount: free ? null : fmt(o.total), positive: false, at: new Date(o.created_at).getTime() });
    }
    for (const d of drinks ?? []) {
      list.push({ id: `d-${d.id}`, kind: "bar", label: "Bár rendelés", sub: null, amount: d.total ? fmt(d.total) : null, positive: false, at: new Date(d.created_at).getTime() });
    }
    for (const c of creds ?? []) {
      const pos = c.amount >= 0;
      list.push({ id: `c-${c.id}`, kind: "credit", label: pos ? "Kredit jóváírás" : "Kredit felhasználás", sub: null, amount: `${pos ? "+" : ""}${c.amount} kredit`, positive: pos, at: new Date(c.created_at).getTime() });
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BG }}>
        <ActivityIndicator size="large" color={DARK} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DARK} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting header ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: DARK, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {session ? `Szia, ${firstName}` : "Bass Piknik"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {session && (
              <PressableScale pressedScale={0.94} onPress={() => router.push("/(app)/buy" as never)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 14, height: 40, backgroundColor: "#fff", shadowColor: DARK, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
                  <Star size={14} color={GREEN} strokeWidth={2.5} fill="#9FE870" />
                  <Text style={{ color: DARK, fontWeight: "800", fontSize: 14 }}>{credits}</Text>
                </View>
              </PressableScale>
            )}
            <IconButton icon={ScanLine} variant="white" size={40} onPress={() => router.push("/(app)/scan" as never)} />
          </View>
        </View>

        {/* ── Events section ── */}
        {events.length > 0 && (
          <View style={{ paddingTop: 32 }}>
            <View style={{ paddingHorizontal: 20 }}>
              <SectionTitle>Események</SectionTitle>
            </View>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              decelerationRate="fast"
              snapToInterval={EVENT_CARD_W + GAP}
              snapToAlignment="start"
            >
              {events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
            </ScrollView>
          </View>
        )}

        {/* ── KIK VAGYUNK section ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 48, paddingBottom: 16 }}>
          <SectionTitle>Kik Vagyunk</SectionTitle>
          <View style={{ width: 48, height: 3, backgroundColor: GREEN, borderRadius: 999, marginBottom: 20 }} />
          <Text style={{ color: DARK, fontSize: 15, fontWeight: "800", lineHeight: 22, marginBottom: 10 }}>
            Helló Piknikezők!
          </Text>
          <Text style={{ color: "#5A5E52", fontSize: 14, fontWeight: "500", lineHeight: 22 }}>
            {"Ha valaha is azon gondolkodtál, milyen lenne egy olyan hely, ahol a tópart, a zöld fű, a jó emberek és a basszus békés együttélésben léteznek, akkor jó hírünk van: megtaláltad.\n\nA Bass Piknik nem egy műfaj. Nem egy trend. Sokkal inkább egy szabadtéri állapot, ahol a house találkozhat a drum & bass-szel, a techno a naplementével.\n\nCélunk egy műfajoktól független open air közösség építése, ahol a zene mellett közösségi programok, nevetések és spontán táncok is születnek.\n\nTalálkozzunk a Tó Parton Kőszegen!"}
          </Text>
        </View>

        {/* ── Lineup section ── */}
        {artists.length > 0 && (
          <View style={{ paddingTop: 32 }}>
            <View style={{ paddingHorizontal: 20 }}>
              <SectionTitle>Lineup</SectionTitle>
            </View>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
            >
              {artists.map((a) => <ArtistCard key={a.id} artist={a} />)}
            </ScrollView>
          </View>
        )}

        {/* ── My Tickets ── */}
        <View style={{ paddingTop: 48 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <SectionTitle>Jegyeim</SectionTitle>
          </View>

          {tickets.length === 0 ? (
            <View style={{ marginHorizontal: 20 }}>
              <View style={{ alignItems: "center", borderRadius: 24, paddingVertical: 40, backgroundColor: "#fff", shadowColor: DARK, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF2C6" }}>
                  <ShoppingBag size={26} color="#2C3A18" strokeWidth={1.75} />
                </View>
                <Text style={{ color: DARK, fontWeight: "700", marginTop: 12 }}>Még nincs jegyed</Text>
                <Text style={{ color: "#6B6F63", fontSize: 13, marginTop: 4 }}>Vegyél jegyet és itt fog megjelenni.</Text>
                <PressableScale pressedScale={0.97} onPress={() => router.push("/(app)/buy" as never)} style={{ marginTop: 16 }}>
                  <View style={{ backgroundColor: DARK, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}>
                    <Text style={{ color: "#C7E04A", fontWeight: "800", fontSize: 14 }}>Jegyek böngészése</Text>
                  </View>
                </PressableScale>
              </View>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_W + GAP} decelerationRate="fast" snapToAlignment="start"
                onScroll={onScroll} scrollEventThrottle={16}
                contentContainerStyle={{ paddingHorizontal: 20 }}
              >
                {tickets.slice(0, MAX_CARDS).map((tk) => {
                  const idx = (orderSeen[tk.order_id] ?? 0) + 1;
                  orderSeen[tk.order_id] = idx;
                  const total = counts[tk.order_id]?.total ?? 1;
                  return <FlipCard key={tk.id} tk={tk} idx={idx} total={total} />;
                })}
                <PressableScale pressedScale={0.98} onPress={() => router.push("/(app)/(tabs)/tickets" as never)} style={{ width: CARD_W }}>
                  <View style={{ minHeight: 260, borderRadius: 20, borderWidth: 1.5, borderColor: "#D8D6C8", borderStyle: "dashed", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#ECEADD" }}>
                      <TicketIcon size={24} color="#EBE05A" strokeWidth={1.75} />
                    </View>
                    <Text style={{ color: DARK, fontWeight: "600" }}>
                      {tickets.length > MAX_CARDS ? `Mind a ${tickets.length} jegy` : "Jegyeim"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ color: "#9a9a9a", fontSize: 14 }}>Összes megtekintése</Text>
                      <ChevronRight size={16} color="#9a9a9a" strokeWidth={1.75} />
                    </View>
                  </View>
                </PressableScale>
              </ScrollView>

              <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 }}>
                {Array.from({ length: Math.min(tickets.length, MAX_CARDS) + 1 }).map((_, i) => (
                  <View key={i} style={{ height: 6, borderRadius: 999, width: i === active ? 20 : 6, backgroundColor: i === active ? DARK : "rgba(20,22,15,0.18)" }} />
                ))}
              </View>

              {!!process.env.EXPO_PUBLIC_APP_URL && (
                <View style={{ paddingHorizontal: 20, marginTop: 14, gap: 8 }}>
                  {Platform.OS === "ios" && (
                    <PressableScale pressedScale={0.97} onPress={() => {
                      const base = process.env.EXPO_PUBLIC_APP_URL!;
                      const tok = session?.access_token ?? "";
                      Linking.openURL(`${base}/api/wallet?token=${encodeURIComponent(tok)}`).catch(() => {});
                    }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, paddingVertical: 14, backgroundColor: DARK }}>
                      <AppleLogo size={18} color="#fff" />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Hozzáadás Apple Wallet-hoz</Text>
                    </PressableScale>
                  )}
                  <PressableScale pressedScale={0.97} onPress={() => {
                    const base = process.env.EXPO_PUBLIC_APP_URL!;
                    const tok = session?.access_token ?? "";
                    Linking.openURL(`${base}/api/google-wallet?token=${encodeURIComponent(tok)}`).catch(() => {});
                  }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#E2E0D4", borderRadius: 999, paddingVertical: 14, backgroundColor: "#fff" }}>
                    <GoogleLogo size={18} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: DARK }}>Hozzáadás Google Wallet-hoz</Text>
                  </PressableScale>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Recent activity ── */}
        {acts.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 40 }}>
            <Text style={{ color: DARK, fontSize: 18, fontWeight: "800", letterSpacing: -0.4, marginBottom: 12 }}>Legutóbbi aktivitás</Text>
            <View style={{ backgroundColor: "#fff", borderRadius: 24, overflow: "hidden", shadowColor: DARK, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
              {acts.map((a, i) => {
                const Icon = actIcon[a.kind];
                return (
                  <View key={a.id} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }, i > 0 ? { borderTopWidth: 1, borderTopColor: "#F0EEE3" } : undefined]}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#ECEADD" }}>
                      <Icon size={18} color={DARK} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: DARK, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{a.label}</Text>
                      {a.sub && <Text style={{ color: "#6B6F63", fontSize: 12 }} numberOfLines={1}>{a.sub}</Text>}
                    </View>
                    {a.amount && (
                      <Text style={{ fontSize: 14, fontWeight: "700", color: a.positive ? "#3E7B12" : DARK }}>
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
