import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Modal, Vibration } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { formatDate } from "@/lib/utils";

interface ScanResult {
  success: boolean;
  holderName?: string | null;
  ticketName?: string | null;
  tier?: string;
  usedAt?: string | null;
  message?: string;
}

export default function CheckInScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const cooldown = useRef(false);

  async function handleScan(qrCode: string) {
    if (cooldown.current) return;
    cooldown.current = true;
    Vibration.vibrate(50);

    const { data, error } = await supabase.rpc("checkin_ticket", { p_qr_code: qrCode });

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

  if (!permission) return <View className="flex-1 bg-background" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-5xl mb-4">📷</Text>
        <Text className="text-foreground text-xl font-bold mb-2">Camera Access</Text>
        <Text className="text-muted-foreground text-sm text-center mb-6">
          Camera is needed to scan ticket QR codes
        </Text>
        <TouchableOpacity onPress={requestPermission} className="bg-primary px-6 py-3 rounded-xl">
          <Text className="text-white font-semibold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="absolute top-0 left-0 right-0 z-10 px-5" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-white text-xl font-bold">Check-In Scanner</Text>
        <Text className="text-white/60 text-sm">{profile?.name}</Text>
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
        <View className="w-64 h-64 border-2 border-white/60 rounded-2xl" />
        <Text className="text-white/70 text-sm mt-4">Align ticket QR within frame</Text>
      </View>

      {/* Result modal */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={dismiss}>
        <TouchableOpacity className="flex-1 justify-end" activeOpacity={1} onPress={dismiss}>
          <View className={`mx-4 mb-8 rounded-3xl p-6 ${
            result?.success
              ? "bg-green-900 border border-green-700"
              : "bg-red-900 border border-red-700"
          }`}>
            <Text className="text-5xl text-center mb-3">{result?.success ? "✅" : "❌"}</Text>
            <Text className="text-white text-xl font-bold text-center mb-1">
              {result?.success ? "Valid Ticket!" : "Rejected"}
            </Text>

            {result?.success && (
              <View className="mt-4 gap-2">
                {result.holderName && <Row label="Name"    value={result.holderName} />}
                {result.ticketName && <Row label="Ticket"  value={result.ticketName} />}
                {result.tier       && <Row label="Tier"    value={result.tier} />}
                {result.usedAt     && <Row label="Checked" value={formatDate(result.usedAt)} />}
              </View>
            )}

            {!result?.success && result?.message && (
              <Text className="text-red-200 text-sm text-center mt-2">{result.message}</Text>
            )}

            <TouchableOpacity
              onPress={dismiss}
              className="mt-5 bg-white/20 rounded-xl py-3 items-center"
            >
              <Text className="text-white font-semibold">Scan Next</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-white/60 text-sm">{label}</Text>
      <Text className="text-white font-medium text-sm">{value}</Text>
    </View>
  );
}
