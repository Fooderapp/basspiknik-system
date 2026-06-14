"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/dashboard/image-upload";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SOCIALS = ["instagram", "facebook", "soundcloud", "spotify", "youtube"];

export function SiteContentEditor() {
  const [c, setC] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-content").then((r) => r.json()).then((d) => setC(d.content ?? {}));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/site-content", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroTitle: c.hero_title, heroSubtitle: c.hero_subtitle, heroImageUrl: c.hero_image_url || null,
          heroCtaLabel: c.hero_cta_label, aboutTitle: c.about_title, aboutBody: c.about_body, socials: c.socials ?? {},
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      toast.success("Homepage saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  if (!c) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const set = (k: string) => (e: any) => setC((p: any) => ({ ...p, [k]: e.target.value }));
  const setSocial = (k: string) => (e: any) => setC((p: any) => ({ ...p, socials: { ...(p.socials ?? {}), [k]: e.target.value } }));

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Homepage</h1>

      <section className="rounded-3xl bg-card p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-lg">Hero</h2>
        <ImageUpload aspect="16/9" value={c.hero_image_url} onChange={(url) => setC((p: any) => ({ ...p, hero_image_url: url }))} />
        <div className="space-y-1.5"><Label>Title</Label><Input value={c.hero_title ?? ""} onChange={set("hero_title")} placeholder="Bass Piknik" /></div>
        <div className="space-y-1.5"><Label>Subtitle</Label><Input value={c.hero_subtitle ?? ""} onChange={set("hero_subtitle")} placeholder="Open-air electronic music · Hungary" /></div>
        <div className="space-y-1.5"><Label>CTA label</Label><Input value={c.hero_cta_label ?? ""} onChange={set("hero_cta_label")} placeholder="Get tickets" /></div>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-lg">About</h2>
        <div className="space-y-1.5"><Label>Title</Label><Input value={c.about_title ?? ""} onChange={set("about_title")} /></div>
        <div className="space-y-1.5"><Label>Body</Label><Textarea rows={5} value={c.about_body ?? ""} onChange={set("about_body")} /></div>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-lg">Social links</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIALS.map((k) => (
            <div key={k} className="space-y-1.5"><Label className="capitalize">{k}</Label><Input value={c.socials?.[k] ?? ""} onChange={setSocial(k)} placeholder="https://…" /></div>
          ))}
        </div>
      </section>

      <Button className="rounded-full px-7" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save homepage"}</Button>
    </div>
  );
}
