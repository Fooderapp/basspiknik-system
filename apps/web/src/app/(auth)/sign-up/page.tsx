import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sign Up" };

export default async function SignUpPage() {
  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Suspense>
          <SignUpForm dict={dict} />
        </Suspense>
      </div>
    </div>
  );
}
