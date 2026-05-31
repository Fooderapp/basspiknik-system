import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

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

          {/* Brand */}
          <View className="items-center mb-12">
            <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4">
              <Text className="text-primary-foreground text-3xl font-bold">E</Text>
            </View>
            <Text className="text-foreground text-3xl font-bold">EventOS</Text>
            <Text className="text-muted-foreground text-sm mt-1">Sign in to continue</Text>
          </View>

          {/* Form */}
          <View className="gap-4">
            <Input
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />

            <Input
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
            />

            {error && (
              <View className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
                <Text className="text-destructive text-sm">{error}</Text>
              </View>
            )}

            <Button
              className="mt-2 w-full"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
            >
              <Text>Sign In</Text>
            </Button>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
