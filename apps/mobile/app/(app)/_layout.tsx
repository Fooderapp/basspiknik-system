import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/context/auth";
import { View, ActivityIndicator } from "react-native";

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#09090b" } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="tickets/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="menu/order" options={{ presentation: "modal" }} />
      <Stack.Screen name="bartender/[orderId]" options={{ presentation: "modal" }} />
    </Stack>
  );
}
