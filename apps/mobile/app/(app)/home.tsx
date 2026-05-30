import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";

interface NavTile {
  icon: string;
  label: string;
  sub: string;
  route: string;
  color: string;
  roles?: string[];
}

const TILES: NavTile[] = [
  { icon: "🎟️", label: "My Tickets",    sub: "View & scan your tickets",   route: "/(app)/tickets",    color: "#7c3aed" },
  { icon: "🍹", label: "Bar Menu",      sub: "Order drinks",                route: "/(app)/menu",       color: "#0891b2" },
  { icon: "📷", label: "Check-In",      sub: "Scan ticket QR codes",        route: "/(app)/checkin",    color: "#059669", roles: ["ADMIN","EDITOR","STAFF","SELLER","BARTENDER"] },
  { icon: "🍺", label: "Bartender POS", sub: "Process drink orders",        route: "/(app)/bartender",  color: "#d97706", roles: ["ADMIN","EDITOR","BARTENDER"] },
  { icon: "💳", label: "Sell Tickets",  sub: "POS ticket selling",          route: "/(app)/seller",     color: "#db2777", roles: ["ADMIN","EDITOR","SELLER"] },
];

export default function HomeScreen() {
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  if (!profile) return null;

  const tiles = TILES.filter(t => !t.roles || t.roles.includes(profile.role));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 40 }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-8">
        <View>
          <Text className="text-muted-foreground text-sm">Welcome back</Text>
          <Text className="text-foreground text-2xl font-bold">{profile.name}</Text>
          <View className="mt-1 self-start bg-primary/20 px-2 py-0.5 rounded-md">
            <Text className="text-primary text-xs font-semibold">{profile.role}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={signOut}
          className="bg-card border border-border rounded-xl px-3 py-2"
        >
          <Text className="text-muted-foreground text-sm">Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Nav tiles */}
      <View className="flex-row flex-wrap gap-4">
        {tiles.map(tile => (
          <TouchableOpacity
            key={tile.route}
            onPress={() => router.push(tile.route as never)}
            activeOpacity={0.8}
            className="bg-card border border-border rounded-2xl p-5 overflow-hidden"
            style={{ width: tiles.length === 1 ? "100%" : "47%" }}
          >
            <View
              className="w-12 h-12 rounded-xl items-center justify-center mb-3"
              style={{ backgroundColor: tile.color + "22" }}
            >
              <Text className="text-3xl">{tile.icon}</Text>
            </View>
            <Text className="text-foreground font-semibold text-base">{tile.label}</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">{tile.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
