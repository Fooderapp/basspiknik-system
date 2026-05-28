import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in?redirectTo=/seller");
  if (!["ADMIN", "EDITOR", "SELLER"].includes(profile.role)) redirect("/");
  return <>{children}</>;
}
