import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { CreditsManager } from "@/components/dashboard/credits-manager";

export const metadata = { title: "Credits" };

export default async function CreditsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");
  return <CreditsManager />;
}
