import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In" };

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
