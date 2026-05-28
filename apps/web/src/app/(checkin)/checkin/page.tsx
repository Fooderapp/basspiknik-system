import { getCurrentProfile } from "@/lib/auth";
import { CheckinScanner } from "@/components/checkin/checkin-scanner";

export default async function CheckinPage() {
  const profile = await getCurrentProfile();
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div>
          <h1 className="font-bold text-lg">Check-In</h1>
          <p className="text-xs text-white/50">{profile?.name ?? profile?.email}</p>
        </div>
        <a href="/dashboard" className="text-xs text-white/40 underline">Dashboard</a>
      </div>
      <CheckinScanner />
    </div>
  );
}
