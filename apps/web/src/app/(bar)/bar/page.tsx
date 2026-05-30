import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { BartenderQueue } from "@/components/bar/bartender-queue";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Bar Queue" };

export default async function BarPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (!["ADMIN", "EDITOR", "STAFF", "BARTENDER"].includes(profile.role)) redirect("/");

  const supabase = await createClient() as any;
  const [{ data: ordersData }, settings] = await Promise.all([
    supabase
      .from("drink_orders")
      .select("*, drink_order_items(*, drinks(name, category))")
      .in("status", ["PENDING", "IN_PROGRESS"])
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: true }),
    getSettings(),
  ]);

  const dict = getDictionary(settings.language);

  return (
    <BartenderQueue
      initialOrders={ordersData ?? []}
      dict={dict}
      currency={settings.currency}
    />
  );
}
