import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { setError("Fill in all fields"); return; }
    setLoading(true);
    setError(null);
    const err = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (err) { setError(err); return; }
    router.replace("/(app)");
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-12">
          {/* Logo / Brand */}
          <View className="items-center mb-12">
            <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4">
              <Text className="text-white text-3xl font-bold">E</Text>
            </View>
            <Text className="text-foreground text-3xl font-bold">EventOS</Text>
            <Text className="text-muted-foreground text-sm mt-1">Sign in to continue</Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            <View>
              <Text className="text-muted-foreground text-xs mb-1.5 uppercase tracking-wider">Email</Text>
              <TextInput
                className="bg-card border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                placeholder="you@example.com"
                placeholderTextColor="#71717a"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View className="mt-4">
              <Text className="text-muted-foreground text-xs mb-1.5 uppercase tracking-wider">Password</Text>
              <TextInput
                className="bg-card border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                placeholder="••••••••"
                placeholderTextColor="#71717a"
                secureTextEntry
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleLogin}
              />
            </View>

            {error && (
              <View className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 mt-2">
                <Text className="text-destructive text-sm">{error}</Text>
              </View>
            )}

            <TouchableOpacity
              className="bg-primary rounded-xl py-4 items-center mt-6"
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text className="text-white font-semibold text-base">Sign In</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
