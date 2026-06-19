import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/context/auth";
import { useLanguage } from "@/context/language";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { GoogleLogo } from "@/components/ui/BrandLogos";

export default function RegisterScreen() {
  const { signUp, signInWithGoogle, signInWithApple } = useAuth();
  const { dict } = useLanguage();
  const [name, setName]             = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple]   = useState(false);

  async function handleRegister() {
    if (!name || !email || !password || !confirm) { setError(dict["auth.fill_all_fields"]); return; }
    if (password !== confirm) { setError(dict["auth.passwords_mismatch"]); return; }
    setLoading(true);
    setError(null);
    const err = await signUp(email.trim().toLowerCase(), password, name.trim());
    setLoading(false);
    if (err) { setError(err); return; }
    setSuccess(true);
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

  if (success) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Image
          source={require("../../assets/icon.png")}
          style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 8 }}
          resizeMode="cover"
        />
        <Text className="text-foreground text-2xl font-bold text-center">{dict["auth.check_email"]}</Text>
        <Text className="text-muted-foreground text-sm text-center">{email}</Text>
        <Pressable onPress={() => router.replace("/(auth)/login" as never)} className="mt-4 active:opacity-60">
          <Text className="text-foreground font-semibold">{dict["auth.sign_in_link"]}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-12">

          {/* Brand */}
          <View className="items-center mb-10">
            <Image
              source={require("../../assets/icon.png")}
              style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 16 }}
              resizeMode="cover"
            />
            <Text className="text-foreground text-3xl font-bold">{dict["auth.register_title"]}</Text>
            <Text className="text-muted-foreground text-sm mt-1">{dict["auth.register_subtitle"]}</Text>
          </View>

          {/* Fields */}
          <View className="gap-4">
            <Input
              label={dict["auth.name"]}
              placeholder={dict["auth.name_placeholder"]}
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={setName}
            />
            <Input
              label={dict["auth.email"]}
              placeholder={dict["auth.email_placeholder"]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label={dict["auth.password"]}
              placeholder={dict["auth.password_placeholder"]}
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            <Input
              label={dict["auth.confirm_password"]}
              placeholder={dict["auth.password_placeholder"]}
              secureTextEntry
              autoComplete="new-password"
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={handleRegister}
            />

            {error && (
              <View className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
                <Text className="text-destructive text-sm">{error}</Text>
              </View>
            )}

            <Button className="mt-2 w-full" onPress={handleRegister} loading={loading} disabled={loading}>
              <Text>{dict["auth.register_btn"]}</Text>
            </Button>
          </View>

          {/* Divider */}
          <View className="flex-row items-center my-6 gap-3">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-muted-foreground text-xs">{dict["auth.or"]}</Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          {/* OAuth */}
          <View className="gap-3">
            <Button
              variant="outline"
              className="w-full flex-row items-center gap-2"
              onPress={handleGoogle}
              loading={loadingGoogle}
              disabled={loadingGoogle}
            >
              <GoogleLogo size={18} />
              <Text>{dict["auth.google"]}</Text>
            </Button>

            {Platform.OS === "ios" && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ width: "100%", height: 48 }}
                onPress={handleApple}
              />
            )}
          </View>

          {/* Login link */}
          <Pressable onPress={() => router.back()} className="mt-8 items-center active:opacity-60">
            <Text className="text-muted-foreground text-sm">
              {dict["auth.have_account"]}{" "}
              <Text className="text-foreground font-semibold">{dict["auth.sign_in_link"]}</Text>
            </Text>
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
