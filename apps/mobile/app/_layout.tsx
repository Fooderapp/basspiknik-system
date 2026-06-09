import "../global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";
import { StripeProvider } from "@stripe/stripe-react-native";
import { AuthProvider } from "@/context/auth";
import { fetchConnectionToken } from "@/lib/stripe-terminal";
import { applyPublicConfig, runtimeConfig } from "@/lib/runtime-config";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function RootLayout() {
  const [publishableKey, setPublishableKey] = useState(runtimeConfig.stripePublishableKey);

  useEffect(() => {
    if (!API_URL) return;
    fetch(`${API_URL}/api/public-config`)
      .then((r) => r.json())
      .then((d) => {
        applyPublicConfig(d);
        if (d?.stripePublishableKey) setPublishableKey(d.stripePublishableKey);
      })
      .catch(() => {/* keep build-time key */});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={publishableKey}
          merchantIdentifier="merchant.com.eventos.mobile"
        >
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
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
