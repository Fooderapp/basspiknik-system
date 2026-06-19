import { redirect } from "next/navigation";
import { Smartphone } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { NotificationSender } from "@/components/dashboard/notification-sender";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function NotificationsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");

  const supabase = await createClient() as any;
  const admin = createAdminClient() as any;
  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  const [{ data: events }, tokenResult] = await Promise.all([
    supabase.from("events").select("id, name").in("status", ["PUBLISHED", "PREORDER"]).order("start_date", { ascending: false }),
    admin.from("push_tokens").select("id", { count: "exact", head: true }),
  ]);

  const pushCount: number = tokenResult.count ?? 0;
  const migrationMissing: boolean = !!tokenResult.error;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{dict["notif.title"]}</h1>
        <p className="text-muted-foreground mt-1">{dict["notif.subtitle"]}</p>
      </div>

      {/* Push token status */}
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 mb-6 text-sm ${
        migrationMissing
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : pushCount === 0
          ? "border-amber-400/40 bg-amber-50 text-amber-700"
          : "border-green-400/40 bg-green-50 text-green-700"
      }`}>
        <Smartphone className="h-4 w-4 shrink-0" />
        {migrationMissing
          ? "⚠ push_tokens table missing — run migration 042 in Supabase SQL Editor"
          : pushCount === 0
          ? "0 devices registered — users must open the app while logged in to register"
          : `${pushCount} device${pushCount === 1 ? "" : "s"} registered`}
      </div>

      <NotificationSender dict={dict} events={(events ?? []) as Array<{ id: string; name: string }>} />
    </div>
  );
}
