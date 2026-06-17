"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, ExternalLink } from "lucide-react";
import Link from "next/link";

interface LegalPageData {
  slug: string;
  title_hu: string;
  title_en: string;
  content_hu: string;
  content_en: string;
}

const PAGES = [
  { slug: "privacy-policy", label: "Adatvédelmi Szabályzat", href: "/adatvedelem" },
  { slug: "aszf",           label: "ÁSZF",                   href: "/aszf" },
  { slug: "impresszum",     label: "Impresszum",              href: "/impresszum" },
];

export function LegalEditor({ initialPages }: { initialPages: Record<string, LegalPageData> }) {
  const [pages, setPages] = useState<Record<string, LegalPageData>>(() => {
    const defaults: Record<string, LegalPageData> = {};
    for (const p of PAGES) {
      defaults[p.slug] = initialPages[p.slug] ?? {
        slug: p.slug, title_hu: p.label, title_en: "", content_hu: "", content_en: "",
      };
    }
    return defaults;
  });
  const [saving, setSaving] = useState<string | null>(null);

  function update(slug: string, field: keyof LegalPageData, value: string) {
    setPages((prev) => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }));
  }

  async function save(slug: string) {
    setSaving(slug);
    try {
      const res = await fetch("/api/legal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pages[slug]),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Tabs defaultValue="privacy-policy">
      <TabsList className="mb-6">
        {PAGES.map((p) => (
          <TabsTrigger key={p.slug} value={p.slug}>{p.label}</TabsTrigger>
        ))}
      </TabsList>

      {PAGES.map((p) => {
        const page = pages[p.slug];
        return (
          <TabsContent key={p.slug} value={p.slug} className="space-y-6">
            {/* Preview link */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Changes are saved immediately and appear on the public page.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href={p.href} target="_blank" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview
                </Link>
              </Button>
            </div>

            {/* Titles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title (HU)</Label>
                <Input
                  value={page.title_hu}
                  onChange={(e) => update(p.slug, "title_hu", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Title (EN)</Label>
                <Input
                  value={page.title_en}
                  onChange={(e) => update(p.slug, "title_en", e.target.value)}
                />
              </div>
            </div>

            {/* Content */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Content (HU)</Label>
                <Textarea
                  value={page.content_hu}
                  onChange={(e) => update(p.slug, "content_hu", e.target.value)}
                  rows={20}
                  className="font-mono text-xs resize-y"
                  placeholder="Szöveg beírása… (soremelések és üres sorok megőrződnek)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Content (EN)</Label>
                <Textarea
                  value={page.content_en}
                  onChange={(e) => update(p.slug, "content_en", e.target.value)}
                  rows={20}
                  className="font-mono text-xs resize-y"
                  placeholder="Enter text… (line breaks and blank lines are preserved)"
                />
              </div>
            </div>

            <Button onClick={() => save(p.slug)} disabled={saving === p.slug} className="gap-2">
              <Save className="h-4 w-4" />
              {saving === p.slug ? "Saving…" : "Save"}
            </Button>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
