import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export default async function CheckinLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in?redirectTo=/checkin");
  if (!["ADMIN", "EDITOR", "STAFF"].includes(profile.role)) redirect("/");
  return <>{children}</>;
}
