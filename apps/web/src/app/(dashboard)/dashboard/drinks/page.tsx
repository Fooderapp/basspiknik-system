import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DrinksManager } from "@/components/drinks/drinks-manager";
import type { Drink } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function DrinksPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient() as any;
  const { data } = await supabase
    .from("drinks")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Drinks Menu</h1>
        <p className="text-muted-foreground">Manage your bar menu — items appear on the public menu and bartender app.</p>
      </div>
      <DrinksManager initialDrinks={(data ?? []) as Drink[]} />
    </div>
  );
}
