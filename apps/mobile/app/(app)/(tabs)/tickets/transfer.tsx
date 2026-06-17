import { useState, useRef } from "react";
import {
  View, ActivityIndicator, Pressable, Alert, Modal, StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView } from "expo-camera";
import { QrCode, Keyboard as KeyboardIcon, UserCheck, X, ArrowRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/context/language";

type Method = "choose" | "scan" | "type";
interface Recipient { id: string; name: string; displayId: string }

export default function TransferScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const insets = useSafeAreaInsets();
  const { dict } = useLanguage();

  const [method, setMethod]         = useState<Method>("choose");
  const [typedId, setTypedId]       = useState("");
  const [recipient, setRecipient]   = useState<Recipient | null>(null);
  const [resolving, setResolving]   = useState(false);
  const [transferring, setTransferring] = useState(false);
  const scanCooldown = useRef(false);

  // ── Resolve identifier → recipient ────────────────────────────────────────
  async function resolveIdentifier(identifier: string) {
    if (resolving || !identifier.trim()) return;
    setResolving(true);
    try {
      const { data, error } = await (supabase as any).rpc("look_up_user", {
        p_identifier: identifier.trim(),
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setRecipient({ id: data.id, name: data.name, displayId: data.displayId });
      setMethod("choose"); // return to confirm view
    } catch (e: any) {
      Alert.alert("Not found", e.message);
    } finally {
      setResolving(false);
      setTimeout(() => { scanCooldown.current = false; }, 2000);
    }
  }

  // ── Execute transfer ───────────────────────────────────────────────────────
  async function confirmTransfer() {
    if (!recipient || !ticketId || transferring) return;
    setTransferring(true);
    try {
      const { data, error } = await (supabase as any).rpc("transfer_ticket", {
        p_ticket_id:     ticketId,
        p_to_identifier: recipient.displayId,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      Alert.alert(
        "Transferred!",
        `Ticket sent to ${data.recipientName} (${data.displayId}).`,
        [{ text: dict["common.done"], onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert("Transfer failed", e.message);
    } finally {
      setTransferring(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-4">
        <Text className="text-foreground text-xl font-bold tracking-tight">{dict["ticket.transfer"]}</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-70 p-1">
          <X size={20} color="#8f8f8f" strokeWidth={1.75} />
        </Pressable>
      </View>

      <Separator />

      <View className="flex-1 px-5 pt-6">

        {/* Confirmed recipient → show confirm card */}
        {recipient && (
          <Card className="mb-6">
            <View className="flex-row items-center gap-3 mb-4">
              <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                <UserCheck size={18} color="#14160F" strokeWidth={1.75} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-bold">{recipient.name}</Text>
                <Text className="text-muted-foreground text-xs">{recipient.displayId}</Text>
              </View>
              <Pressable onPress={() => setRecipient(null)} className="active:opacity-70 p-1">
                <X size={16} color="#8f8f8f" strokeWidth={1.75} />
              </Pressable>
            </View>
            <Button
              variant="destructive"
              className="w-full"
              onPress={confirmTransfer}
              loading={transferring}
              disabled={transferring}
              icon={<ArrowRight size={16} color="#14160F" strokeWidth={1.75} />}
            >
              <Text>{dict["ticket.confirm_transfer"]}</Text>
            </Button>
            <Text className="text-muted-foreground text-xs text-center mt-3">
              {dict["ticket.transfer_warning"]}
            </Text>
          </Card>
        )}

        {/* Method picker */}
        {!recipient && method === "choose" && (
          <View className="gap-3">
            <Text className="text-muted-foreground text-sm mb-2">
              {dict["ticket.identify"]}
            </Text>
            <Button
              variant="outline"
              className="w-full h-16"
              onPress={() => { scanCooldown.current = false; setMethod("scan"); }}
              icon={<QrCode size={20} color="#14160F" strokeWidth={1.75} />}
            >
              <Text className="text-base">{dict["ticket.scan_qr_method"]}</Text>
            </Button>
            <Button
              variant="outline"
              className="w-full h-16"
              onPress={() => setMethod("type")}
              icon={<KeyboardIcon size={20} color="#14160F" strokeWidth={1.75} />}
            >
              <Text className="text-base">{dict["ticket.type_bassid"]}</Text>
            </Button>
          </View>
        )}

        {/* Type Bass-ID */}
        {!recipient && method === "type" && (
          <View className="gap-4">
            <Text className="text-muted-foreground text-sm">
              {dict["ticket.ask_bassid"]}
            </Text>
            <Input
              placeholder="Bass-A3F7K2"
              value={typedId}
              onChangeText={setTypedId}
              autoCapitalize="characters"
              autoFocus
            />
            <Button
              className="w-full"
              onPress={() => resolveIdentifier(typedId)}
              loading={resolving}
              disabled={resolving || typedId.trim().length < 4}
            >
              <Text>{dict["ticket.find_person"]}</Text>
            </Button>
            <Button variant="ghost" className="w-full" onPress={() => setMethod("choose")}>
              <Text className="text-muted-foreground">{dict["common.back"]}</Text>
            </Button>
          </View>
        )}

        {/* QR Scanner */}
        {!recipient && method === "scan" && (
          <View>
            <Text className="text-muted-foreground text-sm mb-4">
              {dict["ticket.scan_wallet_hint"]}
            </Text>
            <View style={{ height: 280, borderRadius: 16, overflow: "hidden" }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => {
                  if (scanCooldown.current || !data) return;
                  scanCooldown.current = true;
                  resolveIdentifier(data);
                }}
              />
              <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
                <View style={{ width: 180, height: 180, borderRadius: 12, borderWidth: 2, borderColor: "#ffffff" }} />
              </View>
              {resolving && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", borderRadius: 16 }]}>
                  <ActivityIndicator size="large" color="#ffffff" />
                </View>
              )}
            </View>
            <Button variant="ghost" className="w-full mt-4" onPress={() => setMethod("choose")}>
              <Text className="text-muted-foreground">{dict["common.back"]}</Text>
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}
