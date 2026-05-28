import { getCurrentProfile } from "@/lib/auth";
import { CheckinScanner } from "@/components/checkin/checkin-scanner";

export default async function CheckinPage() {
  const profile = await getCurrentProfile();
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 py-2 flex items-center justify-end border-b border-white/10">
        <a href="/dashboard" className="text-xs text-white/40 underline">{profile?.name ?? "Dashboard"}</a>
      </div>
      <CheckinScanner />
    </div>
  );
}
