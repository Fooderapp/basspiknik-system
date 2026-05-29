import { getCurrentProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");

  const settings = await getSettings();

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure language and currency for the entire platform.
        </p>
      </div>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
