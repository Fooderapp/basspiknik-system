import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, Camera, CheckCircle2, XCircle, RefreshCw, Ticket, ShoppingCart, ArrowLeft, X, SwitchCamera, Flashlight, FlashlightOff, ScanLine } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { useLanguage } from "@/context/language";
import { t } from "@/lib/i18n";
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
  remaining?: number | null;
  entriesLeft?: number | null;
  isMultiEntry?: boolean;
  message?: string;
}

export default function CheckInScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { dict } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [torch, setTorch] = useState(false);
  const cooldown = useRef(false);

  function accentColor(): string {
    if (!result) return "rgba(255,255,255,0.6)";
    if (!result.success) return "#EF4444";
    if (result.isMultiEntry) return "#3B82F6";
    return "#22C55E";
  }

  function ResultIcon({ size = 52 }: { size?: number }) {
    if (!result?.success) return <XCircle size={size} color="#fff" strokeWidth={2} />;
    if (result.isMultiEntry) return <RefreshCw size={size} color="#fff" strokeWidth={2} />;
    if (result.remaining != null && result.remaining > 0) return <Ticket size={size} color="#fff" strokeWidth={2} />;
    return <CheckCircle2 size={size} color="#fff" strokeWidth={2} />;
  }

  function headline(): string {
    if (!result?.success) return dict["checkin.rejected"];
    if (result.isMultiEntry) {
      const left = result.entriesLeft ?? 0;
      return left > 0
        ? t(dict, "checkin.entries_left", { n: left })
        : dict["checkin.last_entry"];
    }
    return dict["checkin.success"];
  }

  useEffect(() => {
    (supabase as any)
      .from("events")
      .select("*")
      .in("status", ["PUBLISHED", "PREORDER"])
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
            <Text className="text-foreground text-2xl font-bold tracking-tight">{dict["checkin.title"]}</Text>
            <Text className="text-muted-foreground text-sm mt-1">{dict["checkin.subtitle"]}</Text>
          </View>
          <Pressable onPress={() => router.push("/(app)/seller" as never)} className="active:opacity-60 flex-row items-center gap-1.5 bg-primary rounded-xl px-3 py-2 mt-1">
            <ShoppingCart size={14} color="#fff" strokeWidth={1.75} />
            <Text className="text-primary-foreground text-sm font-medium">{dict["checkin.seller"]}</Text>
          </Pressable>
        </View>

        {loadingEvents ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#14160F" />
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
                <Text className="text-foreground font-semibold text-lg tracking-tight">{dict["checkin.no_events"]}</Text>
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
          <Camera size={28} color="#14160F" strokeWidth={1.75} />
        </View>
        <Text className="text-foreground text-xl font-bold mb-2 tracking-tight">{dict["checkin.camera_title"]}</Text>
        <Text className="text-muted-foreground text-sm text-center mb-6">
          {dict["checkin.camera_body"]}
        </Text>
        <Button onPress={requestPermission}>
          <Text>{dict["checkin.grant"]}</Text>
        </Button>
      </View>
    );
  }

  // ── Scanner ───────────────────────────────────────────────────────────────────
  const accent = accentColor();
  const frameColor = result ? accent : "#ffffff";

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing={facing}
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />

      {/* Top bar */}
      <View className="absolute left-0 right-0 z-10 flex-row items-center justify-between px-5" style={{ top: insets.top + 8 }}>
        <Pressable
          onPress={() => setEvent(null)}
          className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
          style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
        >
          <ArrowLeft size={20} color="#111" strokeWidth={2.25} />
        </Pressable>
        <View className="flex-1 mx-3 items-center">
          <Text className="text-white text-base font-semibold" numberOfLines={1} style={{ textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}>
            {event.name}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(app)/seller" as never)}
          className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
          style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
        >
          <X size={20} color="#111" strokeWidth={2.25} />
        </Pressable>
      </View>

      {/* Corner-bracket scan frame */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View style={{ width: 264, height: 264 }}>
          {[
            { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 26 },
            { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 26 },
            { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 26 },
            { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 26 },
          ].map((s, i) => (
            <View key={i} style={{ position: "absolute", width: 46, height: 46, borderColor: frameColor, ...s }} />
          ))}
          <View style={{ position: "absolute", top: "50%", left: 10, right: 10, height: 2, backgroundColor: "rgba(255,255,255,0.6)" }} />
        </View>
      </View>

      {/* Bottom control card */}
      <View className="absolute left-0 right-0 bottom-0" style={{ paddingBottom: insets.bottom + 14 }}>
        <View className="mx-4 rounded-3xl px-6 pt-4 pb-5" style={{ backgroundColor: "rgba(255,255,255,0.96)" }}>
          <Text className="text-center text-sm font-medium mb-4" style={{ color: "#444" }}>
            {dict["checkin.hint"]}
          </Text>
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setTorch((t) => !t)}
              className="w-14 h-14 rounded-full items-center justify-center active:opacity-70"
              style={{ backgroundColor: torch ? "#111" : "#f0f0f0" }}
            >
              {torch ? <Flashlight size={22} color="#fff" strokeWidth={2} /> : <FlashlightOff size={22} color="#111" strokeWidth={2} />}
            </Pressable>

            <View className="w-20 h-20 rounded-full items-center justify-center" style={{ backgroundColor: "#111" }}>
              <ScanLine size={30} color="#fff" strokeWidth={2} />
            </View>

            <Pressable
              onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
              className="w-14 h-14 rounded-full items-center justify-center active:opacity-70"
              style={{ backgroundColor: "#f0f0f0" }}
            >
              <SwitchCamera size={22} color="#111" strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Result bottom sheet */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={dismiss}>
        <Pressable className="flex-1 justify-end" onPress={dismiss}>
          <Pressable onPress={() => {}}>
            <View
              className="rounded-t-3xl px-5 pt-3"
              style={{ backgroundColor: "#171717", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingBottom: insets.bottom + 20 }}
            >
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

              {result?.success && (
                <View className="mt-4 gap-1.5">
                  {result.usedAt && <Row label={dict["checkin.time"]} value={formatDate(result.usedAt)} />}
                  {!result.isMultiEntry && result.remaining != null && result.remaining > 0 && (
                    <Row label={dict["checkin.more_tickets"]} value={`${result.remaining} remaining`} />
                  )}
                  {result.isMultiEntry && result.entriesLeft != null && (
                    <Row label={dict["checkin.entries"]} value={String(result.entriesLeft)} />
                  )}
                </View>
              )}

              <Pressable
                onPress={dismiss}
                className="mt-5 rounded-xl py-3.5 items-center active:opacity-80"
                style={{ backgroundColor: accent }}
              >
                <Text className="font-bold" style={{ color: "#0A0A0A" }}>{dict["checkin.scan_next"]}</Text>
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
