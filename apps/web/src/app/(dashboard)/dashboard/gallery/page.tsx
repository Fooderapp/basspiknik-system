import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { GalleryManager } from "@/components/dashboard/gallery-manager";

export const metadata = { title: "Gallery" };

export default async function GalleryPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");
  return <GalleryManager />;
}
