import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/context/auth";
import { View, ActivityIndicator } from "react-native";

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#14160F" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  // Root stack: the liquid-glass tab bar lives in (tabs); full-screen tools
  // (scanners / POS) and the role redirect sit alongside it so they cover the
  // tab bar when pushed.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000000" } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="checkin/index" />
      <Stack.Screen name="seller/index" />
      <Stack.Screen name="bartender/index" />
    </Stack>
  );
}
