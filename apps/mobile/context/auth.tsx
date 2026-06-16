import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { Session } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signInWithApple: () => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  signIn: async () => null,
  signInWithGoogle: async () => null,
  signInWithApple: async () => null,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, any> }) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      setProfile(data as Profile);
      return;
    }

    // No profile row returned (RLS edge-case, replication lag, or the
    // handle_new_user trigger hasn't run yet). Never strand an authenticated
    // user on a black screen — synthesise a minimal GUEST profile from the
    // auth session so routing can land them on /(app)/home. refreshProfile()
    // (pull-to-refresh / focus) will replace it once the real row is visible.
    setProfile({
      id: user.id,
      email: user.email ?? "",
      name: (user.user_metadata?.name as string) ?? user.email?.split("@")[0] ?? "Guest",
      role: "GUEST",
      avatar_url: null,
    } as Profile);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadProfile(session.user).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Keep the app gated on the loading spinner until the profile resolves —
      // prevents the post-login flash where index/_layout render with a session
      // but no profile yet (which previously showed a black screen).
      if (session?.user) {
        setLoading(true);
        loadProfile(session.user).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signInWithGoogle(): Promise<string | null> {
    const redirectUrl = Linking.createURL("/");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error) return error.message;
    if (!data.url) return "No auth URL returned";

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    if (result.type !== "success") return null; // user cancelled

    const fragment = result.url.split("#")[1];
    if (!fragment) return "No session data in redirect";
    const params = new URLSearchParams(fragment);
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return "Missing tokens in redirect";

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return sessionError?.message ?? null;
  }

  async function signInWithApple(): Promise<string | null> {
    if (Platform.OS !== "ios") return "Apple Sign-In is only available on iOS";
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken!,
      });
      return error?.message ?? null;
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") return null;
      return e.message;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signInWithGoogle, signInWithApple, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
