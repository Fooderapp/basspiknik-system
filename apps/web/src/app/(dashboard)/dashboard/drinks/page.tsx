import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { DrinksManager } from "@/components/drinks/drinks-manager";
import { CategoriesManager } from "@/components/bar/categories-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Drink, DrinkCategoryRow } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function DrinksPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient() as any;
  const [{ data: drinksData }, { data: catsData }, settings] = await Promise.all([
    supabase.from("drinks").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("drink_categories").select("*").order("sort_order").order("name"),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Drinks Menu</h1>
        <p className="text-muted-foreground">Manage your bar menu — items appear on the public menu and bartender app.</p>
      </div>

      <Tabs defaultValue="drinks">
        <TabsList>
          <TabsTrigger value="drinks">Drinks</TabsTrigger>
          <TabsTrigger value="categories">{t(dict, "cat.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="drinks" className="mt-4">
          <DrinksManager
            initialDrinks={(drinksData ?? []) as Drink[]}
            initialCategories={(catsData ?? []) as DrinkCategoryRow[]}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <div className="space-y-2 mb-4">
            <h2 className="text-lg font-semibold">{t(dict, "cat.title")}</h2>
            <p className="text-sm text-muted-foreground">{t(dict, "cat.subtitle")}</p>
          </div>
          <CategoriesManager
            initialCategories={(catsData ?? []) as DrinkCategoryRow[]}
            dict={dict}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
