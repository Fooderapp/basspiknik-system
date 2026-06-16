"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

interface Props {
  dict: Dictionary;
  redirectTo?: string;
}

export function OAuthButtons({ dict, redirectTo = "/home" }: Props) {
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple]   = useState(false);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

  async function signInWith(provider: "google" | "apple", setLoading: (v: boolean) => void) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
    // on success the browser redirects — no need to reset loading
  }

  return (
    <div className="space-y-3">
      <div className="relative flex items-center">
        <div className="flex-1 border-t border-[#E5E3D9]" />
        <span className="px-3 text-xs text-muted-foreground">{dict["auth.or"]}</span>
        <div className="flex-1 border-t border-[#E5E3D9]" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="pill"
        className="w-full h-12 rounded-2xl border border-[#E5E3D9] bg-white font-medium gap-2"
        disabled={loadingGoogle}
        onClick={() => signInWith("google", setLoadingGoogle)}
      >
        {!loadingGoogle && (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
        )}
        {dict["auth.google"]}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="pill"
        className="w-full h-12 rounded-2xl border border-[#E5E3D9] bg-white font-medium gap-2"
        disabled={loadingApple}
        onClick={() => signInWith("apple", setLoadingApple)}
      >
        {!loadingApple && (
          <svg width="15" height="18" viewBox="0 0 170 204" fill="currentColor" aria-hidden>
            <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.2-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.93.21-9.84-1.96-14.75-6.52-3.13-2.73-7.04-7.41-11.73-14.04-5.03-7.08-9.17-15.29-12.41-24.65C33.74 110.67 32 100.88 32 91.4c0-10.86 2.35-20.22 7.05-28.07 3.69-6.3 8.6-11.27 14.75-14.92 6.15-3.65 12.79-5.51 19.95-5.63 3.91 0 9.05 1.21 15.43 3.59 6.36 2.39 10.45 3.6 12.24 3.6 1.34 0 5.88-1.42 13.57-4.24 7.28-2.62 13.42-3.7 18.45-3.27 13.63 1.1 23.87 6.47 30.68 16.15-12.19 7.39-18.22 17.73-18.1 31 .11 10.34 3.86 18.94 11.23 25.77 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.1-2.96 15.67-8.86 22.67-7.12 8.32-15.73 13.13-25.07 12.38a25.3 25.3 0 0 1-.19-3.07c0-7.78 3.39-16.1 9.4-22.91C97.42 13.3 101.26 10.43 105.88 8.17c4.62-2.25 8.99-3.5 13.1-3.71.12 1.02.13 2.04.13 2.78z"/>
          </svg>
        )}
        {dict["auth.apple"]}
      </Button>
    </div>
  );
}
