import { useRef, useState } from "react";
import { Linking, Modal, Pressable, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Camera, ScanLine, Coins, CalendarDays, LinkIcon, MessageSquare, XCircle, type LucideIcon } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";

interface QrResult {
  ok?: boolean;
  type?: "ONE_TIME_CREDIT" | "OPEN_EVENT" | "LINK" | "MESSAGE";
  credits?: number;
  balance?: number;
  eventId?: string | null;
  eventSlug?: string | null;
  url?: string | null;
  message?: string | null;
  error?: string;
}

const ERR: Record<string, string> = {
  auth: "Please sign in first.",
  not_found: "This code isn't valid.",
  exhausted: "This code has been fully used.",
  already: "You've already used this code.",
};

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<QrResult | null>(null);
  const cooldown = useRef(false);

  async function handleScan(data: string) {
    if (cooldown.current) return;
    cooldown.current = true;
    Vibration.vibrate(50);
    // QR may embed a URL (…?c=CODE or /r/CODE) or the bare code.
    let code = data.trim();
    const m = code.match(/[?&]c=([^&]+)/) ?? code.match(/\/r\/([^/?#]+)/);
    if (m) code = decodeURIComponent(m[1]);

    const { data: res, error } = await (supabase as any).rpc("redeem_qr_code", { p_code: code });
    if (error) setResult({ error: error.message });
    else setResult(res as QrResult);
  }

  function dismiss() {
    setResult(null);
    setTimeout(() => { cooldown.current = false; }, 800);
  }

  function act() {
    const r = result;
    dismiss();
    if (!r?.ok) return;
    if (r.type === "OPEN_EVENT" && r.eventId) router.push(`/(app)/buy/${r.eventId}` as never);
    else if (r.type === "LINK" && r.url) Linking.openURL(r.url).catch(() => {});
  }

  if (!permission) return <View className="flex-1" style={{ backgroundColor: "#000" }} />;

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "#F6F5EE", paddingTop: insets.top }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF2C6" }}>
          <Camera size={28} color="#2C3A18" strokeWidth={1.75} />
        </View>
        <Text style={{ color: "#14160F", fontSize: 20, fontWeight: "800", marginTop: 16 }}>Camera Access</Text>
        <Text style={{ color: "#6B6F63", fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 24 }}>
          Allow the camera to scan QR codes for credits, events and more.
        </Text>
        <Button onPress={requestPermission}><Text>Grant Permission</Text></Button>
      </View>
    );
  }

  const ok = result?.ok;
  const RESULT_ICON: Record<string, LucideIcon> = { ONE_TIME_CREDIT: Coins, OPEN_EVENT: CalendarDays, LINK: LinkIcon, MESSAGE: MessageSquare };
  const Icon = ok && result?.type ? RESULT_ICON[result.type] : XCircle;

  function headline(): string {
    if (!result) return "";
    if (!ok) return "Couldn't scan";
    if (result.type === "ONE_TIME_CREDIT") return `+${result.credits} credits!`;
    if (result.type === "OPEN_EVENT") return "Event found";
    if (result.type === "LINK") return "Link ready";
    return result.label ?? "Scanned";
  }
  function body(): string | null {
    if (!result) return null;
    if (!ok) return ERR[result.error ?? ""] ?? "Try again.";
    if (result.type === "ONE_TIME_CREDIT") return `Balance: ${result.balance} credits`;
    if (result.type === "MESSAGE") return result.message ?? null;
    if (result.type === "OPEN_EVENT") return "Tap to view the event.";
    if (result.type === "LINK") return "Tap to open.";
    return null;
  }
  const actLabel = result?.type === "OPEN_EVENT" ? "View event" : result?.type === "LINK" ? "Open" : "Done";

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />

      {/* Top bar */}
      <View className="absolute left-0 right-0 z-10 flex-row items-center justify-between px-5" style={{ top: insets.top + 8 }}>
        <Pressable onPress={() => router.back()} className="w-11 h-11 rounded-full items-center justify-center active:opacity-70" style={{ backgroundColor: "rgba(255,255,255,0.92)" }}>
          <ArrowLeft size={20} color="#111" strokeWidth={2.25} />
        </Pressable>
        <Text className="text-white text-base font-semibold" style={{ textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}>Scan QR</Text>
        <View className="w-11" />
      </View>

      {/* Scan frame */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View style={{ width: 252, height: 252 }}>
          {[
            { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 26 },
            { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 26 },
            { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 26 },
            { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 26 },
          ].map((s, i) => (
            <View key={i} style={{ position: "absolute", width: 44, height: 44, borderColor: "#fff", ...s }} />
          ))}
        </View>
      </View>

      {/* Hint card */}
      <View className="absolute left-0 right-0 bottom-0" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="mx-4 rounded-3xl px-6 py-4 flex-row items-center justify-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.96)" }}>
          <ScanLine size={18} color="#163300" strokeWidth={2} />
          <Text style={{ color: "#444", fontSize: 14, fontWeight: "600" }}>Point at a BassPiknik QR code</Text>
        </View>
      </View>

      {/* Result sheet */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={dismiss}>
        <Pressable className="flex-1 justify-end" onPress={dismiss}>
          <Pressable onPress={() => {}}>
            <View className="rounded-t-3xl px-5 pt-4" style={{ backgroundColor: "#fff", paddingBottom: insets.bottom + 20 }}>
              <View className="self-center mb-4 h-1.5 w-10 rounded-full" style={{ backgroundColor: "#E2E0D4" }} />
              <View className="flex-row items-center gap-3">
                <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: ok ? "#DDF2C6" : "#F6D9DE" }}>
                  <Icon size={26} color={ok ? "#2C3A18" : "#4A1820"} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: "#14160F", fontSize: 18, fontWeight: "800" }}>{headline()}</Text>
                  {body() && <Text style={{ color: "#6B6F63", fontSize: 14, marginTop: 2 }}>{body()}</Text>}
                </View>
              </View>
              <Pressable onPress={act} className="mt-5 rounded-2xl py-3.5 items-center active:opacity-80" style={{ backgroundColor: "#16170F" }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{actLabel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
