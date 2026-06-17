import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
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
import { QRImage } from "@/components/ui/QRImage";
import { TiltCard } from "@/components/ui/TiltCard";
import { useLanguage } from "@/context/language";

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "secondary"> = {
  VALID:     "success",
  USED:      "muted",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
};

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets  = useSafeAreaInsets();
  const { dict } = useLanguage();
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
        <ActivityIndicator size="large" color="#14160F" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Text className="text-foreground text-lg">{dict["ticket.not_found"]}</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-1">
          <ChevronLeft size={16} color="#14160F" strokeWidth={1.75} />
          <Text className="text-foreground">{dict["ticket.go_back"]}</Text>
        </Pressable>
      </View>
    );
  }

  const valid = ticket.status === "VALID";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 gap-3">
        <Pressable onPress={() => router.back()} className="active:opacity-60 flex-row items-center gap-0.5">
          <ChevronLeft size={18} color="#14160F" strokeWidth={1.75} />
          <Text className="text-foreground text-base">{dict["common.back"]}</Text>
        </Pressable>
        <Text className="text-foreground font-bold text-lg flex-1 tracking-tight" numberOfLines={1}>
          {ticket.ticket_name ?? "Ticket"}
        </Text>
        <Badge label={ticket.status} variant={STATUS_VARIANT[ticket.status] ?? "secondary"} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 18 }}>
        {/* Entry pass — whole card tilts with gyro/pan + holo sheen */}
        <TiltCard maxTilt={10} radius={28} surface="#FFFFFF" holo="shimmer">
          <View
            style={{ borderRadius: 28, padding: 22, borderWidth: 1, borderColor: "#E6E4D8" }}
          >
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-muted-foreground text-[11px] font-semibold tracking-[2px]">
                {(ticket.tier ?? "TICKET").toUpperCase()}
              </Text>
              <Badge label={ticket.status} variant={STATUS_VARIANT[ticket.status] ?? "secondary"} />
            </View>

            <View className="items-center">
              {valid ? (
                <View className="bg-white p-4 rounded-3xl">
                  <QRImage value={ticket.qr_code} size={210} />
                </View>
              ) : (
                <View className="w-56 h-56 items-center justify-center bg-muted rounded-3xl gap-3">
                  <Ban size={40} color="#8f8f8f" strokeWidth={1.5} />
                  <Text className="text-muted-foreground text-sm">{ticket.status}</Text>
                </View>
              )}
            </View>

            <View className="flex-row items-center justify-between mt-5">
              <View className="flex-1 mr-3">
                <Text className="text-muted-foreground text-[10px] tracking-wider">{dict["ticket.label"]}</Text>
                <Text className="text-foreground font-semibold" numberOfLines={1}>
                  {ticket.ticket_name ?? "Ticket"}
                </Text>
              </View>
              <Text className="text-muted-foreground text-[10px]">{dict["ticket.scan_entry"]}</Text>
            </View>
          </View>
        </TiltCard>

        {/* Details */}
        <Card className="gap-3">
          {ticket.holder_name && <Row label={dict["ticket.name"]} value={ticket.holder_name} />}
          {ticket.holder_email && <Row label={dict["ticket.email"]} value={ticket.holder_email} />}
          <Row label={dict["ticket.tier"]} value={ticket.tier} />
          <Row label={dict["ticket.issued"]} value={formatDate(ticket.created_at)} />
          {ticket.used_at && <Row label={dict["ticket.used"]} value={formatDate(ticket.used_at)} />}
          {ticket.transferred_to_user_id && <Row label={dict["ticket.transferred"]} value="Yes" />}
          <Separator />
          <Text className="text-muted-foreground text-xs font-mono" numberOfLines={1}>
            {ticket.qr_code}
          </Text>
        </Card>

        {/* Transfer — only for VALID tickets */}
        {valid && (
          <Button
            variant="outline"
            className="w-full"
            onPress={() => router.push(`/(app)/tickets/transfer?ticketId=${ticket.id}` as never)}
            icon={<ArrowRightLeft size={16} color="#14160F" strokeWidth={1.75} />}
          >
            <Text>{dict["ticket.transfer"]}</Text>
          </Button>
        )}
      </ScrollView>
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
