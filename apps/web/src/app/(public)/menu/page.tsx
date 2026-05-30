import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { BarMenu } from "@/components/bar/bar-menu";
import type { Drink } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Bar Menu" };

export default async function MenuPage() {
  const supabase = await createClient() as any;
  const [{ data }, settings] = await Promise.all([
    supabase
      .from("drinks")
      .select("*")
      .eq("available", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);

  return (
    <BarMenu
      drinks={(data ?? []) as Drink[]}
      dict={dict}
      currency={settings.currency}
    />
  );
}
