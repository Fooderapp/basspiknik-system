import { View, Image, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, User, Mail, Shield } from "lucide-react-native";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
      </Card>

      {/* Wallet QR pass */}
      {qrUrl && (
        <>
          <Text className="text-foreground font-semibold text-base mb-3 mt-2">Entry Pass</Text>
          <Card className="items-center py-8">
            <View className="bg-white p-4 rounded-2xl mb-4">
              <Image
                source={{ uri: qrUrl }}
                style={{ width: 200, height: 200 }}
                resizeMode="contain"
              />
            </View>
            <Text className="text-foreground font-semibold mb-1">Scan at check-in</Text>
            <Text className="text-muted-foreground text-xs text-center px-6">
              Show this QR code at the entrance or to a seller. Same code as your Apple Wallet pass.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
