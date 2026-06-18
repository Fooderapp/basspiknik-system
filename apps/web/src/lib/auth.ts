import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/supabase/types";

export async function getSession() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getSession();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null);
}

export async function requireRole(allowedRoles: UserRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !allowedRoles.includes(profile.role)) throw new Error("Unauthorized");
  return profile;
}

export async function upsertProfile(id: string, email: string, name = "") {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id, email, name: name || email.split("@")[0] })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}
