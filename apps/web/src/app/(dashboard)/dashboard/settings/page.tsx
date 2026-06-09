import { getCurrentProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { SystemConfigForm } from "@/components/dashboard/system-config-form";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");

  const settings = await getSettings();

  return (
    <div className="p-6 max-w-2xl space-y-10">
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure language and currency for the entire platform.
          </p>
        </div>
        <SettingsForm initialSettings={settings} />
      </div>

      <Separator />

      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Integrations &amp; keys</h2>
          <p className="text-muted-foreground mt-1">
            Stripe, Billingo, Resend and the public URL — manage them here instead of Vercel.
          </p>
        </div>
        <SystemConfigForm />
      </div>
    </div>
  );
}
