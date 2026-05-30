import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth";
import type { UserRole } from "@/lib/types";

// Route each role to their primary screen
function homeRoute(role: UserRole): string {
  switch (role) {
    case "BARTENDER": return "/(app)/bartender";
    case "SELLER":    return "/(app)/seller";
    case "STAFF":     return "/(app)/checkin";
    default:          return "/(app)/home";
  }
}

export default function AppIndex() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <Redirect href={homeRoute(profile.role) as never} />;
}
