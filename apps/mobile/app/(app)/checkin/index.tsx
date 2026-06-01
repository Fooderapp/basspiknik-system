import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, Camera, CheckCircle2, XCircle, RefreshCw } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import type { Event } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface ScanResult {
  success: boolean;
  holderName?: string | null;
  ticketName?: string | null;
  tier?: string;
  usedAt?: string | null;
  remaining?: number;
  message?: string;
}

export default function CheckInScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const cooldown = useRef(false);

  // ── Border color: idle=white, success=green, multi-entry=blue, fail=red ──
  function borderColor(): string {
    if (!result) return "rgba(255,255,255,0.6)";
    if (!result.success) return "#EF4444";
    if (typeof result.remaining === "number") return "#3B82F6";
    return "#22C55E";
  }

  function modalColor(): string {
    if (!result?.success) return "#EF4444";
    if (typeof result.remaining === "number") return "#3B82F6";
    return "#22C55E";
  }

  useEffect(() => {
    (supabase as any)
      .from("events")
      .select("*")
      .eq("status", "PUBLISHED")
      .order("start_date")
      .then(({ data }: any) => { setEvents(data ?? []); setLoadingEvents(false); });
  }, []);

  async function handleScan(walletToken: string) {
    if (cooldown.current || !event) return;
    cooldown.current = true;
    Vibration.vibrate(50);

    const { data, error } = await supabase.rpc("checkin_user_ticket", {
      p_wallet_token: walletToken,
      p_event_id:     event.id,
    });

    if (error) {
      setResult({ success: false, message: error.message });
    } else {
      setResult(data as ScanResult);
    }
  }

  function dismiss() {
    setResult(null);
    setTimeout(() => { cooldown.current = false; }, 1200);
  }

  // ── Event picker ────────────────────────────────────────────────────────────
  if (!event) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 py-4">
          <Text className="text-foreground text-2xl font-bold tracking-tight">Check-In</Text>
          <Text className="text-muted-foreground text-sm mt-1">Pick the event for this door</Text>
        </View>

        {loadingEvents ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#fafafa" />
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={e => e.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
            ListEmptyComponent={
              <View className="items-center py-20">
                <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
                  <Calendar size={24} color="#8f8f8f" strokeWidth={1.75} />
                </View>
                <Text className="text-foreground font-semibold text-lg tracking-tight">No published events</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => setEvent(item)} className="mb-3 active:opacity-75">
                <Card>
                  <Text className="text-foreground font-semibold text-base tracking-tight" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-1">
                    {formatDate(item.start_date)}{item.venue ? ` · ${item.venue}` : ""}
                  </Text>
                </Card>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // ── Camera permission ─────────────────────────────────────────────────────────
  if (!permission) return <View className="flex-1 bg-background" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <View className="w-16 h-16 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
          <Camera size={28} color="#fafafa" strokeWidth={1.75} />
        </View>
        <Text className="text-foreground text-xl font-bold mb-2 tracking-tight">Camera Access</Text>
        <Text className="text-muted-foreground text-sm text-center mb-6">
          Camera is needed to scan Wallet passes
        </Text>
        <Button onPress={requestPermission}>
          <Text>Grant Permission</Text>
        </Button>
      </View>
    );
  }

  // ── Scanner ───────────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="absolute top-0 left-0 right-0 z-10 px-5 flex-row items-start justify-between" style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-1 mr-3">
          <Text className="text-white text-xl font-bold" numberOfLines={1}>{event.name}</Text>
          <Text className="text-white/60 text-sm">{profile?.name}</Text>
        </View>
        <Pressable onPress={() => setEvent(null)} className="active:opacity-60 bg-white/15 rounded-xl px-3 py-2">
          <Text className="text-white text-sm font-medium">Change</Text>
        </Pressable>
      </View>

      {/* Camera */}
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />

      {/* Scan frame overlay — border changes colour on result */}
      <View className="absolute inset-0 items-center justify-center">
        <View style={{ width: 256, height: 256, borderWidth: 3, borderRadius: 16, borderColor: borderColor() }} />
        <Text className="text-white/70 text-sm mt-4">Scan the attendee's Wallet pass</Text>
      </View>

      {/* Result modal */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={dismiss}>
        <Pressable className="flex-1 justify-end" onPress={dismiss}>
          <View
            style={{ backgroundColor: modalColor() }}
            className="mx-4 mb-8 rounded-3xl p-6"
          >
            <View className="items-center mb-3">
              {result?.success
                ? typeof result.remaining === "number"
                  ? <RefreshCw size={52} color="#fff" strokeWidth={1.75} />
                  : <CheckCircle2 size={52} color="#fff" strokeWidth={1.75} />
                : <XCircle size={52} color="#fff" strokeWidth={1.75} />}
            </View>
            <Text className="text-white text-xl font-bold text-center mb-1 tracking-tight">
              {result?.success
                ? typeof result.remaining === "number"
                  ? `Re-entry — ${result.remaining} left`
                  : "Checked In!"
                : "Rejected"}
            </Text>

            {result?.success && (
              <View className="mt-4 gap-2">
                {result.holderName && <Row label="Name"   value={result.holderName} />}
                {result.ticketName && <Row label="Ticket" value={result.ticketName} />}
                {result.tier       && <Row label="Tier"   value={result.tier} />}
                {result.usedAt     && <Row label="Time"   value={formatDate(result.usedAt)} />}
                {typeof result.remaining === "number" && (
                  <Row label="Remaining on pass" value={String(result.remaining)} />
                )}
              </View>
            )}

            {!result?.success && result?.message && (
              <Text className="text-white/80 text-sm text-center mt-2">{result.message}</Text>
            )}

            <Pressable
              onPress={dismiss}
              className="mt-5 rounded-xl py-3 items-center active:opacity-60"
              style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
            >
              <Text className="text-white font-semibold">Scan Next</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-white/60 text-sm">{label}</Text>
      <Text className="text-white font-semibold text-sm">{value}</Text>
    </View>
  );
}
