import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/public/site-header";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata: Metadata = { title: "Sign Up" };

export default async function SignUpPage() {
  const settings = await getSettings();
  const dict = getDictionary(settings.language);
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="relative min-h-screen">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero-bg.png" alt="" className="fixed inset-0 z-0 h-screen w-screen object-cover" />

      <SiteHeader dict={dict} loggedIn={!!user} />

      <div className="relative z-[1] flex min-h-screen items-center justify-center px-5 py-24">
        <div className="w-full max-w-sm">
          <Suspense>
            <SignUpForm dict={dict} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
