import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import type { Profile } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROLE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  ADMIN:  "destructive",
  EDITOR: "default",
  GUEST:  "secondary",
};

export default async function GuestsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient() as any;
  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at, onboarded_at")
    .order("created_at", { ascending: false });

  const users = (data ?? []) as Profile[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7" />
            {dict["guests.title"]}
          </h1>
          <p className="text-muted-foreground mt-1">{users.length} registered accounts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{dict["guests.empty"]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="px-6 py-3 text-left font-medium">{dict["guests.name"]}</th>
                    <th className="px-6 py-3 text-left font-medium">{dict["guests.email"]}</th>
                    <th className="px-6 py-3 text-left font-medium">{dict["guests.role"]}</th>
                    <th className="px-6 py-3 text-left font-medium">{dict["guests.joined"]}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3 font-medium">{u.name || "—"}</td>
                      <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-6 py-3">
                        <Badge variant={ROLE_VARIANT[u.role] ?? "secondary"} className="text-xs">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground tabular-nums">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
