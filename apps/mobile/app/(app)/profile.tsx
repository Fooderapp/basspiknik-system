import { View, Image, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, User, Mail, Shield, Hash } from "lucide-react-native";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TiltCard } from "@/components/ui/TiltCard";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function ProfileScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  if (!profile) return null;

  const qrUrl = profile.wallet_token
    ? `${API_URL}/api/tickets/qr?code=${profile.wallet_token}`
    : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 40 }}
    >
      {/* Header */}
      <View className="flex-row items-center mb-6">
        <Button variant="ghost" size="sm" className="px-0 mr-3" onPress={() => router.back()} icon={<ChevronLeft size={15} color="#fafafa" strokeWidth={1.75} />}>
          <Text className="text-foreground text-sm">Back</Text>
        </Button>
      </View>

      <Text className="text-foreground text-2xl font-bold tracking-tight mb-1">My Profile</Text>
      <Text className="text-muted-foreground text-sm mb-6">Your account and entry pass</Text>

      {/* Profile info */}
      <Card className="mb-4 gap-3">
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
            <User size={16} color="#8f8f8f" strokeWidth={1.75} />
          </View>
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">Name</Text>
            <Text className="text-foreground font-semibold">{profile.name}</Text>
          </View>
        </View>
        <Separator />
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
            <Mail size={16} color="#8f8f8f" strokeWidth={1.75} />
          </View>
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">Email</Text>
            <Text className="text-foreground font-semibold">{profile.email}</Text>
          </View>
        </View>
        <Separator />
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
            <Shield size={16} color="#8f8f8f" strokeWidth={1.75} />
          </View>
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">Role</Text>
            <View className="mt-0.5 self-start">
              <Badge label={profile.role} variant="default" />
            </View>
          </View>
        </View>
        {profile.display_id && (
          <>
            <Separator />
            <View className="flex-row items-center gap-3">
              <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
                <Hash size={16} color="#8f8f8f" strokeWidth={1.75} />
              </View>
              <View className="flex-1">
                <Text className="text-muted-foreground text-xs">Bass-ID</Text>
                <Text className="text-foreground font-mono font-semibold">{profile.display_id}</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {/* Wallet-style holographic entry pass */}
      {qrUrl && (
        <>
          <Text className="text-foreground font-semibold text-base mb-3 mt-2">Entry Pass</Text>
          <TiltCard maxTilt={11} radius={28} style={{ marginBottom: 12 }}>
            <View
              style={{
                borderRadius: 28,
                padding: 22,
                backgroundColor: "#0d0d12",
                borderWidth: 1,
                borderColor: "#26263a",
                overflow: "hidden",
              }}
            >
              {/* pass header */}
              <View className="flex-row items-center justify-between mb-5">
                <Text className="text-muted-foreground text-[11px] font-semibold tracking-[2px]">
                  ENTRY PASS
                </Text>
                <Badge label={profile.role} variant="default" />
              </View>

              {/* holder */}
              <Text className="text-foreground text-2xl font-bold tracking-tight" numberOfLines={1}>
                {profile.name}
              </Text>
              <Text className="text-muted-foreground text-xs mb-5" numberOfLines={1}>
                {profile.email}
              </Text>

              {/* QR */}
              <View className="items-center">
                <View className="bg-white p-3.5 rounded-2xl">
                  <Image source={{ uri: qrUrl }} style={{ width: 188, height: 188 }} resizeMode="contain" />
                </View>
              </View>

              {/* footer */}
              <View className="flex-row items-center justify-between mt-5">
                <View>
                  <Text className="text-muted-foreground text-[10px] tracking-wider">BASS-ID</Text>
                  <Text className="text-foreground font-mono font-semibold">
                    {profile.display_id ?? "—"}
                  </Text>
                </View>
                <Text className="text-muted-foreground text-[10px]">Scan at check-in</Text>
              </View>
            </View>
          </TiltCard>
          <Text className="text-muted-foreground text-xs text-center px-6">
            Same code as your Apple Wallet pass. Share your Bass-ID to receive ticket transfers.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
