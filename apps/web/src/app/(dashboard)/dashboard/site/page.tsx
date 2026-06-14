import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SiteContentEditor } from "@/components/dashboard/site-content-editor";

export const metadata = { title: "Homepage" };

export default async function SitePage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");
  return <SiteContentEditor />;
}
