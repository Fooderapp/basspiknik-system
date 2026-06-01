import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Ban, ArrowRightLeft } from "lucide-react-native";
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

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets  = useSafeAreaInsets();
  const [ticket, setTicket]     = useState<Ticket | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (supabase as any)
      .from("tickets")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }: { data: Ticket }) => { setTicket(data); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#fafafa" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Text className="text-foreground text-lg">Ticket not found</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-1">
          <ChevronLeft size={16} color="#fafafa" strokeWidth={1.75} />
          <Text className="text-foreground">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 gap-4">
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-0.5">
          <ChevronLeft size={18} color="#fafafa" strokeWidth={1.75} />
          <Text className="text-foreground text-base">Back</Text>
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1 tracking-tight" numberOfLines={1}>
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
            <View className="w-56 h-56 items-center justify-center bg-muted rounded-2xl gap-3">
              <Ban size={40} color="#8f8f8f" strokeWidth={1.5} />
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
          {ticket.transferred_to_user_id && <Row label="Transferred" value="Yes" />}
          <Separator />
          <Text className="text-muted-foreground text-xs font-mono" numberOfLines={1}>
            {ticket.qr_code}
          </Text>
        </Card>

        {/* Transfer button — only for VALID tickets */}
        {ticket.status === "VALID" && (
          <Button
            variant="outline"
            className="w-full"
            onPress={() => router.push(`/(app)/transfer?ticketId=${ticket.id}` as never)}
            icon={<ArrowRightLeft size={16} color="#fafafa" strokeWidth={1.75} />}
          >
            <Text>Transfer Ticket</Text>
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
