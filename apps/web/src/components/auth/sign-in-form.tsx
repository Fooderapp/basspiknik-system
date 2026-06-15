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
import type { Dictionary } from "@/lib/i18n";

interface Props { dict: Dictionary }

export function SignInForm({ dict }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const [loading, setLoading] = useState(false);

  const schema = z.object({
    email: z.string().email(dict["auth.invalid_email"]),
    password: z.string().min(6, dict["auth.min_chars_6"]),
  });
  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="rounded-[2.25rem] bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
          {dict["auth.signin_title"]}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{dict["auth.signin_desc"]}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            placeholder="••••••••"
            className="h-12 rounded-2xl border-none bg-[#F6F5EE] px-4"
            {...register("password")}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="brand" size="pill" className="w-full" disabled={loading}>
          {loading ? dict["auth.signing_in"] : dict["auth.sign_in"]}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {dict["auth.no_account"]}{" "}
        <Link href="/sign-up" className="font-semibold text-[#16170F] underline underline-offset-4">
          {dict["auth.sign_up"]}
        </Link>
      </p>
    </div>
  );
}
