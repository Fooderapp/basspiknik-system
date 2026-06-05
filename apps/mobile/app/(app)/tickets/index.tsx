import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Linking, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Apple, Wallet, Ticket as TicketIcon, User, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const GAP = 12;
const H_PAD = 20;
const CARD_WIDTH = (Dimensions.get("window").width - H_PAD * 2 - GAP) / 2;

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "secondary"> = {
  VALID:     "success",
  USED:      "muted",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
};

export default function TicketsScreen() {
  const { session } = useAuth();
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingWallet, setAddingWallet]             = useState(false);
  const [addingGoogleWallet, setAddingGoogleWallet] = useState(false);

  async function addToAppleWallet() {
    setAddingWallet(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      await Linking.openURL(`${API_URL}/api/wallet?token=${encodeURIComponent(session.access_token)}`);
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setAddingWallet(false); }
  }

  async function addToGoogleWallet() {
    setAddingGoogleWallet(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      await Linking.openURL(`${API_URL}/api/google-wallet?token=${encodeURIComponent(session.access_token)}`);
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setAddingGoogleWallet(false); }
  }

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

  const hasValid = tickets.some(t => t.status === "VALID");

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
        contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 32, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
      >
        {/* Wallet buttons */}
        {hasValid && (
          <View className="gap-2 mb-5">
            {Platform.OS === "ios" && (
              <Button variant="secondary" className="w-full" onPress={addToAppleWallet} loading={addingWallet} disabled={addingWallet} icon={<Apple size={18} color="#fafafa" strokeWidth={1.75} />}>
                <Text className="font-semibold">Add to Apple Wallet</Text>
              </Button>
            )}
            <Button variant="secondary" className="w-full" onPress={addToGoogleWallet} loading={addingGoogleWallet} disabled={addingGoogleWallet} icon={<Wallet size={18} color="#fafafa" strokeWidth={1.75} />}>
              <Text className="font-semibold">Add to Google Wallet</Text>
            </Button>
          </View>
        )}

        {/* 2-column grid */}
        {tickets.length === 0 ? (
          <View className="items-center py-20">
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
              <TicketIcon size={24} color="#8f8f8f" strokeWidth={1.75} />
            </View>
            <Text className="text-foreground font-semibold text-lg tracking-tight">No tickets yet</Text>
            <Text className="text-muted-foreground text-sm mt-1">Your purchased tickets appear here</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
            {tickets.map(item => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/(app)/tickets/${item.id}` as never)}
                className="active:opacity-75"
                style={{ width: CARD_WIDTH }}
              >
                <Card className="flex-1">
                  <View className="mb-2">
                    <Badge label={item.status} variant={STATUS_VARIANT[item.status] ?? "secondary"} />
                  </View>
                  <View className="w-9 h-9 rounded-xl items-center justify-center mb-3 border border-border bg-muted">
                    <TicketIcon size={17} color="#fafafa" strokeWidth={1.75} />
                  </View>
                  <Text className="text-foreground font-semibold text-sm tracking-tight" numberOfLines={2}>
                    {item.ticket_name ?? "Ticket"}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                    {formatDate(item.created_at)}
                  </Text>
                  {item.holder_name && (
                    <View className="flex-row items-center gap-1 mt-1.5">
                      <User size={11} color="#8f8f8f" strokeWidth={1.75} />
                      <Text className="text-muted-foreground text-xs" numberOfLines={1}>{item.holder_name}</Text>
                    </View>
                  )}
                  <Separator className="mt-3 mb-2" />
                  <View className="flex-row items-center justify-between">
                    <Text className="text-muted-foreground text-xs">QR</Text>
                    <ChevronRight size={13} color="#8f8f8f" strokeWidth={1.75} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
