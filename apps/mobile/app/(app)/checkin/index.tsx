import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, Camera, CheckCircle2, XCircle, RefreshCw, Ticket, ShoppingCart } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import type { Event } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";

interface ScanResult {
  success: boolean;
  holderName?: string | null;
  ticketName?: string | null;
  tier?: string | null;
  usedAt?: string | null;
  // wallet pass + single-entry: how many more tickets this user has at this event
  remaining?: number | null;
  // multi-entry ticket: how many entry slots remain on this specific ticket
  entriesLeft?: number | null;
  isMultiEntry?: boolean;
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

  // Blue  = multi-entry ticket
  // Green = single-entry (admitted, or has more tickets remaining)
  // Red   = error
  function accentColor(): string {
    if (!result) return "rgba(255,255,255,0.6)";
    if (!result.success) return "#EF4444";
    if (result.isMultiEntry) return "#3B82F6";
    return "#22C55E";
  }

  // Icon: RefreshCw for multi-entry, Ticket for "has more tickets", CheckCircle2 otherwise
  function ResultIcon({ size = 52 }: { size?: number }) {
    if (!result?.success) return <XCircle size={size} color="#fff" strokeWidth={2} />;
    if (result.isMultiEntry) return <RefreshCw size={size} color="#fff" strokeWidth={2} />;
    if (result.remaining != null && result.remaining > 0) return <Ticket size={size} color="#fff" strokeWidth={2} />;
    return <CheckCircle2 size={size} color="#fff" strokeWidth={2} />;
  }

  function headline(): string {
    if (!result?.success) return "Rejected";
    if (result.isMultiEntry) {
      const left = result.entriesLeft ?? 0;
      return left > 0 ? `Entry used — ${left} left` : "Last entry used";
    }
    if (result.remaining != null && result.remaining > 0) return "Checked In!";
    return "Checked In!";
  }

  useEffect(() => {
    (supabase as any)
      .from("events")
      .select("*")
      .eq("status", "PUBLISHED")
      .order("start_date")
      .then(({ data }: any) => { setEvents(data ?? []); setLoadingEvents(false); });
  }, []);

  async function handleScan(qrData: string) {
    if (cooldown.current || !event) return;
    cooldown.current = true;
    Vibration.vibrate(50);

    const { data, error } = await (supabase as any).rpc("checkin_user_ticket", {
      p_wallet_token: qrData,
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

  // ── Event picker ──────────────────────────────────────────────────────────────
  if (!event) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 py-4 flex-row items-start justify-between">
          <View>
            <Text className="text-foreground text-2xl font-bold tracking-tight">Check-In</Text>
            <Text className="text-muted-foreground text-sm mt-1">Pick the event for this door</Text>
          </View>
          <Pressable onPress={() => router.push("/(app)/seller" as never)} className="active:opacity-60 flex-row items-center gap-1.5 bg-primary rounded-xl px-3 py-2 mt-1">
            <ShoppingCart size={14} color="#fff" strokeWidth={1.75} />
            <Text className="text-primary-foreground text-sm font-medium">Seller POS</Text>
          </Pressable>
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
              <PressableScale onPress={() => setEvent(item)} style={{ marginBottom: 12 }} pressedScale={0.97}>
                <Card>
                  <Text className="text-foreground font-semibold text-base tracking-tight" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-1">
                    {formatDate(item.start_date)}{item.venue ? ` · ${item.venue}` : ""}
                  </Text>
                </Card>
              </PressableScale>
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
          Camera is needed to scan Wallet passes and ticket QRs
        </Text>
        <Button onPress={requestPermission}>
          <Text>Grant Permission</Text>
        </Button>
      </View>
    );
  }

  // ── Scanner ───────────────────────────────────────────────────────────────────
  const accent = accentColor();

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="absolute top-0 left-0 right-0 z-10 px-5 flex-row items-start justify-between" style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-1 mr-3">
          <Text className="text-white text-xl font-bold" numberOfLines={1}>{event.name}</Text>
          <Text className="text-white/60 text-sm">{profile?.name}</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={() => router.push("/(app)/seller" as never)} className="active:opacity-60 bg-white/15 rounded-xl px-3 py-2 flex-row items-center gap-1.5">
            <ShoppingCart size={14} color="#fff" strokeWidth={1.75} />
            <Text className="text-white text-sm font-medium">POS</Text>
          </Pressable>
          <Pressable onPress={() => setEvent(null)} className="active:opacity-60 bg-white/15 rounded-xl px-3 py-2">
            <Text className="text-white text-sm font-medium">Change</Text>
          </Pressable>
        </View>
      </View>

      {/* Camera */}
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />

      {/* Scan frame overlay */}
      <View className="absolute inset-0 items-center justify-center">
        <View style={{ width: 256, height: 256, borderWidth: 3, borderRadius: 16, borderColor: accent }} />
        <Text className="text-white/70 text-sm mt-4">Scan Wallet pass or ticket QR</Text>
      </View>

      {/* Result bottom sheet — matches the web check-in styling */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={dismiss}>
        <Pressable className="flex-1 justify-end" onPress={dismiss}>
          {/* Inner press stops backdrop dismiss when tapping the sheet itself */}
          <Pressable onPress={() => {}}>
            <View
              className="rounded-t-3xl px-5 pt-3"
              style={{ backgroundColor: "#171717", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingBottom: insets.bottom + 20 }}
            >
              {/* grab handle */}
              <View className="self-center mb-4 h-1.5 w-10 rounded-full" style={{ backgroundColor: accent }} />

              <View className="flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: accent }}>
                  <ResultIcon size={26} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-black tracking-wide" style={{ color: accent }}>{headline()}</Text>
                  {result?.success ? (
                    <Text className="text-white text-sm" numberOfLines={1}>
                      <Text className="text-white font-semibold">{result.holderName ?? "Guest"}</Text>
                      {result.ticketName ? <Text className="text-white/50"> · {result.ticketName}</Text> : null}
                    </Text>
                  ) : result?.message ? (
                    <Text className="text-white/60 text-sm" numberOfLines={2}>{result.message}</Text>
                  ) : null}
                </View>
                {result?.tier ? (
                  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                    <Text className="text-white/70 text-[10px] uppercase tracking-wide">{result.tier.replace("_", " ")}</Text>
                  </View>
                ) : null}
              </View>

              {/* Meta rows */}
              {result?.success && (
                <View className="mt-4 gap-1.5">
                  {result.usedAt && <Row label="Time" value={formatDate(result.usedAt)} />}
                  {!result.isMultiEntry && result.remaining != null && result.remaining > 0 && (
                    <Row label="More tickets" value={`${result.remaining} remaining`} />
                  )}
                  {result.isMultiEntry && result.entriesLeft != null && (
                    <Row label="Entries left" value={String(result.entriesLeft)} />
                  )}
                </View>
              )}

              <Pressable
                onPress={dismiss}
                className="mt-5 rounded-xl py-3.5 items-center active:opacity-80"
                style={{ backgroundColor: accent }}
              >
                <Text className="font-bold" style={{ color: "#0A0A0A" }}>Scan Next</Text>
              </Pressable>
            </View>
          </Pressable>
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
