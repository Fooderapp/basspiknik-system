"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Ticket } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

interface Props { dict: Dictionary }

export function SignUpForm({ dict }: Props) {
  const router = useRouter();
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
    router.push("/sign-in");
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Ticket className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">{dict["auth.signup_title"]}</CardTitle>
        <CardDescription>{dict["auth.signup_desc"]}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{dict["auth.full_name"]}</Label>
            <Input id="name" placeholder="Jane Smith" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{dict["auth.email"]}</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{dict["auth.password"]}</Label>
            <Input id="password" type="password" placeholder={dict["auth.pw_placeholder"]} {...register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{dict["auth.confirm_password"]}</Label>
            <Input id="confirm" type="password" placeholder="••••••••" {...register("confirm")} />
            {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? dict["auth.creating"] : dict["auth.create"]}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        {dict["auth.have_account"]}&nbsp;
        <Link href="/sign-in" className="text-primary underline underline-offset-4">{dict["auth.sign_in_link"]}</Link>
      </CardFooter>
    </Card>
  );
}
