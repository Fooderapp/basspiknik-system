import { getCurrentProfile } from "@/lib/auth";
import { CheckinScanner } from "@/components/checkin/checkin-scanner";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";

export default async function CheckinPage() {
  const [profile, settings] = await Promise.all([getCurrentProfile(), getSettings()]);
  const dict = getDictionary(settings.language);
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b border-white/10">
        <a href="/seller" className="text-xs text-white/60 hover:text-white/80 transition-colors px-2 py-1 rounded border border-white/20 hover:border-white/40">
          Seller POS →
        </a>
        <a href="/dashboard" className="text-xs text-white/40 underline">{profile?.name ?? "Dashboard"}</a>
      </div>
      <CheckinScanner dict={dict} />
    </div>
  );
}
