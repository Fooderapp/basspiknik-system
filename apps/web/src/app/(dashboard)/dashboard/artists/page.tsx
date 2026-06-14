import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ArtistsManager } from "@/components/dashboard/artists-manager";

export const metadata = { title: "Artists" };

export default async function ArtistsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");
  return <ArtistsManager />;
}
