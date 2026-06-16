import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export default function LoginScreen() {
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple]   = useState(false);

  async function handleLogin() {
    if (!email || !password) { setError("Fill in all fields"); return; }
    setLoading(true);
    setError(null);
    const err = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (err) { setError(err); return; }
    router.replace("/(app)");
  }

  async function handleGoogle() {
    setLoadingGoogle(true);
    setError(null);
    const err = await signInWithGoogle();
    setLoadingGoogle(false);
    if (err) { setError(err); return; }
    router.replace("/(app)");
  }

  async function handleApple() {
    setLoadingApple(true);
    setError(null);
    const err = await signInWithApple();
    setLoadingApple(false);
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

          {/* Email / password */}
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

          {/* Divider */}
          <View className="flex-row items-center my-6 gap-3">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-muted-foreground text-xs">or</Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          {/* OAuth buttons */}
          <View className="gap-3">
            <Button
              variant="outline"
              className="w-full flex-row items-center gap-2"
              onPress={handleGoogle}
              loading={loadingGoogle}
              disabled={loadingGoogle}
            >
              {/* Google G */}
              <Text style={{ fontFamily: undefined, fontSize: 16 }}>G</Text>
              <Text>Continue with Google</Text>
            </Button>

            {Platform.OS === "ios" && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ width: "100%", height: 48 }}
                onPress={handleApple}
              />
            )}
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
