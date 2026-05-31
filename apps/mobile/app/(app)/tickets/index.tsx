import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
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

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "secondary"> = {
  VALID:     "success",
  USED:      "muted",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
};

export default function TicketsScreen() {
  const { session } = useAuth();
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingWallet, setAddingWallet] = useState(false);

  async function addToAppleWallet() {
    setAddingWallet(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      // Single per-user pass — iOS auto-prompts "Add to Apple Wallet" for the .pkpass MIME type
      const url = `${API_URL}/api/wallet`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to generate pass");
        }
        Alert.alert("Apple Wallet", "Pass downloaded. Check your Files app.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAddingWallet(false);
    }
  }

  const hasValid = tickets.some(t => t.status === "VALID");

  async function load() {
    if (!session) return;
    const { data } = await (supabase as any)
      .from("tickets")
      .select("*, orders!inner(user_id)")
      .eq("orders.user_id", session.user.id)
      .order("created_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
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
          <ActivityIndicator size="large" color="#7c3aed" />
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
      <FlatList
        data={tickets}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
        ListHeaderComponent={
          Platform.OS === "ios" && hasValid ? (
            <Button
              variant="secondary"
              className="w-full mb-4"
              onPress={addToAppleWallet}
              loading={addingWallet}
              disabled={addingWallet}
            >
              <Text className="font-semibold">🍎 Add to Apple Wallet</Text>
            </Button>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center py-20">
            <Text className="text-5xl mb-4">🎟️</Text>
            <Text className="text-foreground font-semibold text-lg">No tickets yet</Text>
            <Text className="text-muted-foreground text-sm mt-1">Your purchased tickets appear here</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/tickets/${item.id}` as never)}
            className="mb-3 active:opacity-75"
          >
            <Card>
              <View className="flex-row items-start justify-between mb-2">
                <View className="flex-1 mr-3">
                  <Text className="text-foreground font-semibold text-base" numberOfLines={1}>
                    {item.ticket_name ?? "Ticket"}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">{formatDate(item.created_at)}</Text>
                </View>
                <Badge label={item.status} variant={STATUS_VARIANT[item.status] ?? "secondary"} />
              </View>
              {item.holder_name && (
                <Text className="text-muted-foreground text-sm">👤 {item.holder_name}</Text>
              )}
              <Separator className="mt-3 mb-3" />
              <Text className="text-muted-foreground text-xs">Tap to view QR code →</Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
