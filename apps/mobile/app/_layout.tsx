import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";
import { AuthProvider } from "@/context/auth";
import { fetchConnectionToken } from "@/lib/stripe-terminal";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeTerminalProvider
          logLevel="none"
          tokenProvider={fetchConnectionToken}
        >
          <AuthProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000000" } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </AuthProvider>
        </StripeTerminalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
