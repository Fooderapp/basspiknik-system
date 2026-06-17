import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "ÁSZF" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AszfPage() {
  const supabase = await createClient() as any;
  const settings = await getSettings();
  const lang = settings.language ?? "hu";

  const { data } = await supabase
    .from("legal_pages")
    .select("title_hu, title_en, content_hu, content_en")
    .eq("slug", "aszf")
    .single();

  const title   = lang === "en" ? (data?.title_en   ?? "Terms and Conditions") : (data?.title_hu   ?? "ÁSZF");
  const content = lang === "en" ? (data?.content_en ?? "")                      : (data?.content_hu ?? "");

  return <LegalPage title={title} content={content} />;
}

function LegalPage({ title, content }: { title: string; content: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-6" style={{ letterSpacing: "-0.03em" }}>
        {title}
      </h1>
      {content ? (
        <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">A tartalom hamarosan elérhető.</p>
      )}
    </div>
  );
}
