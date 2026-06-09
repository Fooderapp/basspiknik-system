"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, FileText, Mail, Globe, Save, Eye, EyeOff, Loader2, type LucideIcon } from "lucide-react";

interface KeyStatus {
  key: string;
  group: string;
  label: string;
  secret: boolean;
  placeholder: string;
  clientBuild: boolean;
  source: "db" | "env" | "unset";
  isSet: boolean;
  preview: string;
}

const GROUP_ICON: Record<string, LucideIcon> = {
  Stripe: CreditCard,
  Billingo: FileText,
  Resend: Mail,
  General: Globe,
};

export function SystemConfigForm() {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/system-config");
    if (!res.ok) { toast.error("Failed to load config"); return; }
    const data = await res.json();
    setKeys(data.keys);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const dirty = Object.keys(drafts).length > 0;

  async function save() {
    setSaving(true);
    try {
      const updates = Object.entries(drafts).map(([key, value]) => ({ key, value: value.length ? value : null }));
      const res = await fetch("/api/admin/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      const data = await res.json();
      setKeys(data.keys);
      setDrafts({});
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const groups = Array.from(new Set(keys.map((k) => k.group)));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">⚠️ Sensitive keys</p>
        These values are stored in the database and used by the server. A value set here overrides the matching
        Vercel env var. Leave a field blank to keep the current value; clear a saved value to fall back to the env var.
        Keys marked <Badge variant="secondary" className="mx-1 text-[10px]">client build</Badge> also need a Vercel
        change + redeploy/rebuild to reach the browser & mobile app.
      </div>

      {groups.map((group) => {
        const Icon = GROUP_ICON[group] ?? Globe;
        const groupKeys = keys.filter((k) => k.group === group);
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icon className="h-5 w-5" /> {group}
              </CardTitle>
              <CardDescription>{group} integration keys</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupKeys.map((k) => {
                const isSecret = k.secret && !reveal[k.key];
                const draft = drafts[k.key];
                const showVal = draft !== undefined ? draft : "";
                return (
                  <div key={k.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={k.key} className="flex items-center gap-2">
                        {k.label}
                        {k.clientBuild && <Badge variant="secondary" className="text-[10px]">client build</Badge>}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {k.isSet ? (
                          <span className="flex items-center gap-1">
                            <Badge variant={k.source === "db" ? "default" : "outline"} className="text-[10px]">
                              {k.source === "db" ? "DB" : "env"}
                            </Badge>
                            <code className="text-[11px]">{k.preview}</code>
                          </span>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">not set</Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id={k.key}
                        type={isSecret ? "password" : "text"}
                        autoComplete="off"
                        placeholder={k.placeholder || (k.isSet ? "•••• (leave blank to keep)" : "")}
                        value={showVal}
                        onChange={(e) => setDrafts((d) => ({ ...d, [k.key]: e.target.value }))}
                      />
                      {k.secret && (
                        <Button type="button" variant="outline" size="icon" onClick={() => setReveal((r) => ({ ...r, [k.key]: !r[k.key] }))}>
                          {reveal[k.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={!dirty || saving} className="gap-2 shadow-lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
