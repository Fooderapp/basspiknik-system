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

export function OAuthButtons({ dict, redirectTo = "/dashboard" }: Props) {
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple]   = useState(false);

  const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

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
          <svg width="16" height="18" viewBox="0 0 814 1000" fill="currentColor" aria-hidden>
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 405.6 30.3 252.9 30.3 201.7c0-6.5 1.3-85.6 59.4-150.3C128 7 197.9-23.9 265.2-23.9c66.9 0 111.3 39.5 155.5 39.5 43 0 97.6-42.1 172.4-42.1 27.6 0 116.9 2.6 175.1 97.2zm-178.7-43.1c-4.4-3.9-101.3-10.6-145.5 60.3-44.2 70.9-24 151.6-18.1 153.6 5.8 1.9 80.9.6 131.6-69.9 50.7-70.5 37.7-139.1 32-144z"/>
          </svg>
        )}
        {dict["auth.apple"]}
      </Button>
    </div>
  );
}
