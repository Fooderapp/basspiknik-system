import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { NotificationSender } from "@/components/dashboard/notification-sender";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function NotificationsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");

  const supabase = await createClient() as any;
  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .in("status", ["PUBLISHED", "PREORDER"])
    .order("start_date", { ascending: false });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{dict["notif.title"]}</h1>
        <p className="text-muted-foreground mt-1">{dict["notif.subtitle"]}</p>
      </div>
      <NotificationSender dict={dict} events={(events ?? []) as Array<{ id: string; name: string }>} />
    </div>
  );
}
