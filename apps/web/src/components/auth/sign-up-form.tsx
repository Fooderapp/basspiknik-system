"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import type { Dictionary } from "@/lib/i18n";

interface Props { dict: Dictionary }

export function SignUpForm({ dict }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const signInHref = redirectTo ? `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}` : "/sign-in";
  const [loading, setLoading] = useState(false);

  const schema = z.object({
    name: z.string().min(2, dict["auth.name_short"]),
    email: z.string().email(dict["auth.invalid_email"]),
    password: z.string().min(8, dict["auth.min_chars_8"]),
    confirm: z.string(),
  }).refine((d) => d.password === d.confirm, {
    message: dict["auth.pw_mismatch"],
    path: ["confirm"],
  });
  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const supabase = createClient();

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { name: data.name },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      });
    }

    toast.success(dict["auth.confirm_email"]);
    router.push(signInHref);
  };

  return (
    <div className="rounded-[2.25rem] bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
          {dict["auth.signup_title"]}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{dict["auth.signup_desc"]}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{dict["auth.full_name"]}</Label>
          <Input
            id="name"
            placeholder="Jane Smith"
            className="h-12 rounded-2xl border-none bg-[#F6F5EE] px-4"
            {...register("name")}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{dict["auth.email"]}</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="h-12 rounded-2xl border-none bg-[#F6F5EE] px-4"
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{dict["auth.password"]}</Label>
          <Input
            id="password"
            type="password"
            placeholder={dict["auth.pw_placeholder"]}
            className="h-12 rounded-2xl border-none bg-[#F6F5EE] px-4"
            {...register("password")}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{dict["auth.confirm_password"]}</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="••••••••"
            className="h-12 rounded-2xl border-none bg-[#F6F5EE] px-4"
            {...register("confirm")}
          />
          {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
        </div>
        <Button type="submit" variant="brand" size="pill" className="w-full" disabled={loading}>
          {loading ? dict["auth.creating"] : dict["auth.create"]}
        </Button>
      </form>

      <div className="mt-4">
        <OAuthButtons dict={dict} />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {dict["auth.have_account"]}{" "}
        <Link href={signInHref} className="font-semibold text-[#16170F] underline underline-offset-4">
          {dict["auth.sign_in_link"]}
        </Link>
      </p>
    </div>
  );
}
