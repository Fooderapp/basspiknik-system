import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage() {
  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Suspense>
          <SignInForm dict={dict} />
        </Suspense>
      </div>
    </div>
  );
}
