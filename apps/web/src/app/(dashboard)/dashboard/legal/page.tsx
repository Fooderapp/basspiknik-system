import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LegalEditor } from "./legal-editor";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Legal Pages" };

export default async function LegalPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");

  const supabase = await createClient() as any;
  const { data: pages } = await supabase
    .from("legal_pages")
    .select("*")
    .in("slug", ["privacy-policy", "aszf", "impresszum"]);

  const bySlug = Object.fromEntries((pages ?? []).map((p: any) => [p.slug, p]));

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Legal Pages</h1>
        <p className="text-muted-foreground mt-1">
          Edit the content of your Privacy Policy, ÁSZF, and Impresszum pages.
        </p>
      </div>
      <LegalEditor initialPages={bySlug} />
    </div>
  );
}
