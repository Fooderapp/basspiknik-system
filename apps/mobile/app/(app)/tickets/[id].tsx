import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import QRCode from "react-native-qrcode-svg";

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "secondary"> = {
  VALID:     "success",
  USED:      "muted",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets  = useSafeAreaInsets();
  const [ticket, setTicket]     = useState<Ticket | null>(null);
  const [loading, setLoading]   = useState(true);
  const [addingWallet, setAddingWallet] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("tickets")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }: { data: Ticket }) => { setTicket(data); setLoading(false); });
  }, [id]);

  async function addToAppleWallet() {
    if (!ticket) return;
    setAddingWallet(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Open the pkpass URL — iOS automatically prompts "Add to Apple Wallet"
      const url = `${API_URL}/api/tickets/${ticket.id}/wallet`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: fetch and open as data URI
        const res = await fetch(url, {
          headers: { "Authorization": `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to generate pass");
        }
        // On iOS, response with Content-Type application/vnd.apple.pkpass
        // triggers the Wallet sheet automatically via Linking
        Alert.alert("Apple Wallet", "Pass downloaded. Check your Downloads or Files app.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAddingWallet(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Text className="text-foreground text-lg">Ticket not found</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60">
          <Text className="text-primary">← Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 gap-4">
        <Pressable onPress={() => router.back()} className="active:opacity-60">
          <Text className="text-primary text-base">← Back</Text>
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1" numberOfLines={1}>
          {ticket.ticket_name ?? "Ticket"}
        </Text>
        <Badge label={ticket.status} variant={STATUS_VARIANT[ticket.status] ?? "secondary"} />
      </View>

      <View className="flex-1 items-center justify-center px-6 gap-6">
        {/* QR Code */}
        <View className="bg-white rounded-3xl p-6">
          {ticket.status === "VALID" ? (
            <QRCode value={ticket.qr_code} size={220} />
          ) : (
            <View className="w-56 h-56 items-center justify-center bg-muted rounded-2xl">
              <Text className="text-5xl mb-2">🚫</Text>
              <Text className="text-muted-foreground text-sm">{ticket.status}</Text>
            </View>
          )}
        </View>

        {/* Details card */}
        <Card className="w-full gap-3">
          {ticket.holder_name && <Row label="Name" value={ticket.holder_name} />}
          {ticket.holder_email && <Row label="Email" value={ticket.holder_email} />}
          <Row label="Tier" value={ticket.tier} />
          <Row label="Issued" value={formatDate(ticket.created_at)} />
          {ticket.used_at && <Row label="Used" value={formatDate(ticket.used_at)} />}
          <Separator />
          <Text className="text-muted-foreground text-xs font-mono" numberOfLines={1}>
            {ticket.qr_code}
          </Text>
        </Card>

        {/* Apple Wallet button — iOS only, valid tickets only */}
        {Platform.OS === "ios" && ticket.status === "VALID" && (
          <Button
            variant="secondary"
            className="w-full"
            onPress={addToAppleWallet}
            loading={addingWallet}
            disabled={addingWallet}
          >
            <Text className="font-semibold">🍎 Add to Apple Wallet</Text>
          </Button>
        )}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className="text-foreground text-sm font-medium">{value}</Text>
    </View>
  );
}
