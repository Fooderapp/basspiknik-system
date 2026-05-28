import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/sign-in");

  const dashboardRoles = ["ADMIN", "EDITOR", "STAFF", "SELLER", "BARTENDER"];
  if (!dashboardRoles.includes(profile.role)) redirect("/");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={profile.role} />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
