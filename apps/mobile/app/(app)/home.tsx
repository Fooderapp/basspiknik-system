import { useCallback, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Ticket, Wine, ScanLine, Beer, CreditCard, UserCircle,
  Compass, ShoppingBag, Star, ChevronRight, type LucideIcon,
} from "lucide-react-native";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import type { Ticket as TicketType } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const GAP = 12;
const H_PAD = 20;
const CARD_WIDTH = (Dimensions.get("window").width - H_PAD * 2 - GAP) / 2;

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "secondary"> = {
  VALID: "success", USED: "muted", CANCELLED: "destructive", REFUNDED: "secondary",
};

interface NavTile {
  icon: LucideIcon;
  label: string;
  sub: string;
  route: string;
  roles?: string[];
}

const TILES: NavTile[] = [
  { icon: Ticket,      label: "My Tickets",     sub: "View & scan your tickets",    route: "/(app)/tickets" },
  { icon: ShoppingBag, label: "Buy Tickets",    sub: "Browse & buy event tickets",  route: "/(app)/buy" },
  { icon: Wine,        label: "Bar Menu",       sub: "Order drinks",                route: "/(app)/menu" },
  { icon: Compass,     label: "Friend Compass", sub: "Find friends at the event",   route: "/(app)/compass" },
  { icon: ScanLine,    label: "Check-In",       sub: "Scan ticket QR codes",        route: "/(app)/checkin",   roles: ["ADMIN","EDITOR","STAFF","SELLER","BARTENDER"] },
  { icon: Beer,        label: "Bartender POS",  sub: "Process drink orders",        route: "/(app)/bartender", roles: ["ADMIN","EDITOR","BARTENDER"] },
  { icon: CreditCard,  label: "Sell Tickets",   sub: "POS ticket selling",          route: "/(app)/seller",    roles: ["ADMIN","EDITOR","SELLER"] },
];

export default function HomeScreen() {
  const { profile, session, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [credits, setCredits]           = useState<number | null>(null);
  const [recentTickets, setRecentTickets] = useState<TicketType[]>([]);
  const [loadingData, setLoadingData]   = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  async function fetchData() {
    if (!session) return;
    const [creditRes, ticketRes] = await Promise.all([
      (supabase as any).rpc("get_credit_balance", { p_user_id: session.user.id }),
      (supabase as any)
        .from("tickets")
        .select("*")
        .in("status", ["VALID", "USED"])
        .order("created_at", { ascending: false })
        .limit(4),
    ]);
    // tickets from own orders
    const { data: owned } = await (supabase as any)
      .from("tickets")
      .select("*, orders!inner(user_id)")
      .eq("orders.user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(4);

    setCredits(typeof creditRes.data === "number" ? creditRes.data : 0);

    const seen = new Set<string>();
    const unique = ((owned ?? []) as TicketType[]).filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    setRecentTickets(unique.slice(0, 4));
  }

  // Refresh every time the screen is focused (e.g. coming back from buy screen)
  useFocusEffect(
    useCallback(() => {
      setLoadingData(true);
      fetchData().finally(() => setLoadingData(false));
    }, [session])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  if (!profile) return null;

  const tiles = TILES.filter(t => !t.roles || t.roles.includes(profile.role));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: H_PAD, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between mb-4">
        <Pressable className="flex-1 mr-3 active:opacity-70" onPress={() => router.push("/(app)/profile")}>
          <Text className="text-muted-foreground text-sm">Welcome back</Text>
          <Text className="text-foreground text-2xl font-bold">{profile.name}</Text>
          <View className="flex-row items-center gap-2 mt-1.5">
            <Badge label={profile.role} variant="default" />
            <View className="flex-row items-center gap-1">
              <UserCircle size={12} color="#8f8f8f" strokeWidth={1.75} />
              <Text className="text-muted-foreground text-xs">My Profile</Text>
            </View>
          </View>
        </Pressable>
        <Button variant="outline" size="sm" onPress={signOut}>
          <Text>Sign out</Text>
        </Button>
      </View>

      {/* ── Credits pill ──────────────────────────────────────────── */}
      <Pressable onPress={() => router.push("/(app)/tickets" as never)} className="active:opacity-75 mb-5">
        <View className="flex-row items-center justify-between bg-muted rounded-2xl px-4 py-3 border border-border">
          <View className="flex-row items-center gap-2.5">
            <View className="w-8 h-8 rounded-xl items-center justify-center bg-primary">
              <Star size={16} color="#000" strokeWidth={2} fill="#000" />
            </View>
            <View>
              <Text className="text-muted-foreground text-xs">Your credits</Text>
              {loadingData ? (
                <ActivityIndicator size="small" color="#fafafa" />
              ) : (
                <Text className="text-foreground font-bold text-lg leading-tight">
                  {credits ?? 0}
                  <Text className="text-muted-foreground font-normal text-sm"> credits</Text>
                </Text>
              )}
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-muted-foreground text-xs">4 = free spin</Text>
            <ChevronRight size={14} color="#8f8f8f" strokeWidth={1.75} />
          </View>
        </View>
      </Pressable>

      {/* ── Recent tickets ────────────────────────────────────────── */}
      {recentTickets.length > 0 && (
        <View className="mb-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground font-semibold text-base">My Tickets</Text>
            <Pressable onPress={() => router.push("/(app)/tickets" as never)} className="active:opacity-60">
              <Text className="text-muted-foreground text-xs">See all →</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: GAP }}>
            {recentTickets.slice(0, 2).map(ticket => (
              <Pressable
                key={ticket.id}
                onPress={() => router.push(`/(app)/tickets/${ticket.id}` as never)}
                className="active:opacity-75"
                style={{ width: CARD_WIDTH }}
              >
                <Card className="flex-1">
                  <View className="mb-2">
                    <Badge label={ticket.status} variant={STATUS_VARIANT[ticket.status] ?? "secondary"} />
                  </View>
                  <View className="w-8 h-8 rounded-xl items-center justify-center mb-2 border border-border bg-background">
                    <Ticket size={15} color="#fafafa" strokeWidth={1.75} />
                  </View>
                  <Text className="text-foreground font-semibold text-xs tracking-tight" numberOfLines={2}>
                    {ticket.ticket_name ?? "Ticket"}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                    {formatDate(ticket.created_at)}
                  </Text>
                </Card>
              </Pressable>
            ))}
            {/* If only 1 ticket, show "Buy more" placeholder */}
            {recentTickets.length === 1 && (
              <Pressable
                onPress={() => router.push("/(app)/buy" as never)}
                className="active:opacity-75"
                style={{ width: CARD_WIDTH }}
              >
                <Card className="flex-1 items-center justify-center" style={{ minHeight: 100 }}>
                  <ShoppingBag size={20} color="#8f8f8f" strokeWidth={1.5} />
                  <Text className="text-muted-foreground text-xs mt-2 text-center">Buy more tickets</Text>
                </Card>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <Separator className="mb-5" />

      {/* ── Nav tiles ─────────────────────────────────────────────── */}
      <View className="flex-row flex-wrap gap-4">
        {tiles.map(tile => {
          const Icon = tile.icon;
          return (
            <Pressable
              key={tile.route}
              onPress={() => router.push(tile.route as never)}
              className="active:opacity-75"
              style={{ width: tiles.length === 1 ? "100%" : "47%" }}
            >
              <Card className="p-5">
                <View className="w-11 h-11 rounded-xl items-center justify-center mb-4 border border-border bg-muted">
                  <Icon size={20} color="#fafafa" strokeWidth={1.75} />
                </View>
                <Text className="text-foreground font-semibold text-base tracking-tight">{tile.label}</Text>
                <Text className="text-muted-foreground text-xs mt-1">{tile.sub}</Text>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
