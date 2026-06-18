import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { VenuesManager } from "@/components/dashboard/venues-manager";

export const metadata = { title: "Map Pins" };

export default async function VenuesPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");
  return <VenuesManager />;
}
