"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Loader2, Check, X, Gift, Inbox } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PLATFORMS = ["internal", "facebook", "instagram", "tiktok", "google", "youtube", "other"] as const;

interface Task {
  id: string;
  title: string;
  description: string | null;
  platform: string;
  url: string | null;
  cta_label: string;
  reward_credits: number;
  repeatable: boolean;
  cooldown_hours: number;
  requires_review: boolean;
  active: boolean;
  sort_order: number;
}

const EMPTY = {
  title: "", description: "", platform: "internal", url: "", ctaLabel: "Mark done",
  rewardCredits: 1, repeatable: false, cooldownHours: 0, requiresReview: false,
  active: true, sortOrder: 0,
};

export function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/tasks");
    if (!res.ok) { toast.error("Failed to load tasks"); setLoading(false); return; }
    const d = await res.json();
    setTasks(d.tasks ?? []);
    setPending(d.pending ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function startCreate() { setForm({ ...EMPTY }); setEditingId(null); setShowForm(true); }
  function startEdit(t: Task) {
    setForm({
      title: t.title, description: t.description ?? "", platform: t.platform, url: t.url ?? "",
      ctaLabel: t.cta_label, rewardCredits: t.reward_credits, repeatable: t.repeatable,
      cooldownHours: t.cooldown_hours, requiresReview: t.requires_review, active: t.active, sortOrder: t.sort_order,
    });
    setEditingId(t.id);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      const method = editingId ? "PATCH" : "POST";
      const body = editingId ? { ...form, id: editingId } : form;
      const res = await fetch("/api/admin/tasks", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error?.formErrors?.[0] ?? "Save failed");
      toast.success(editingId ? "Task updated" : "Task created");
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    const res = await fetch("/api/admin/tasks", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (res.ok) { toast.success("Deleted"); await load(); } else toast.error("Delete failed");
  }

  async function review(completionId: string, approve: boolean) {
    const res = await fetch("/api/admin/tasks/review", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completionId, approve }),
    });
    if (res.ok) { toast.success(approve ? "Approved" : "Rejected"); await load(); } else toast.error("Failed");
  }

  const setF = (k: keyof typeof EMPTY, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <Tabs defaultValue="tasks" className="space-y-6">
      <TabsList>
        <TabsTrigger value="tasks" className="gap-1.5"><Gift className="h-4 w-4" /> Tasks</TabsTrigger>
        <TabsTrigger value="review" className="gap-1.5">
          <Inbox className="h-4 w-4" /> Review
          {pending.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px]">{pending.length}</Badge>}
        </TabsTrigger>
      </TabsList>

      {/* ── Tasks ── */}
      <TabsContent value="tasks" className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={showForm ? () => setShowForm(false) : startCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> {showForm ? "Close" : "New task"}
          </Button>
        </div>

        {showForm && (
          <Card className="border-primary/40">
            <CardHeader className="pb-3"><CardTitle className="text-base">{editingId ? "Edit task" : "New task"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="Follow us on Instagram" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="Tap, follow @basspiknik, come back." />
                </div>
                <div className="space-y-1.5">
                  <Label>Platform</Label>
                  <Select value={form.platform} onValueChange={(v) => setF("platform", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reward (credits)</Label>
                  <Input type="number" min={0} value={form.rewardCredits} onChange={(e) => setF("rewardCredits", parseInt(e.target.value || "0", 10))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Link / deep-link (optional)</Label>
                  <Input value={form.url} onChange={(e) => setF("url", e.target.value)} placeholder="https://instagram.com/basspiknik" />
                </div>
                <div className="space-y-1.5">
                  <Label>Button label</Label>
                  <Input value={form.ctaLabel} onChange={(e) => setF("ctaLabel", e.target.value)} placeholder="Follow" />
                </div>
                <div className="space-y-1.5">
                  <Label>Sort order</Label>
                  <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setF("sortOrder", parseInt(e.target.value || "0", 10))} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <Row label="Repeatable" hint="Off = once per user. On = can repeat (with cooldown).">
                  <Switch checked={form.repeatable} onCheckedChange={(v) => setF("repeatable", v)} />
                </Row>
                {form.repeatable && (
                  <div className="space-y-1.5">
                    <Label>Cooldown (hours)</Label>
                    <Input type="number" min={0} value={form.cooldownHours} onChange={(e) => setF("cooldownHours", parseInt(e.target.value || "0", 10))} className="w-32" />
                  </div>
                )}
                <Row label="Requires review" hint="Credits held until an admin approves (use for high-value / screenshot tasks).">
                  <Switch checked={form.requiresReview} onCheckedChange={(v) => setF("requiresReview", v)} />
                </Row>
                <Row label="Active" hint="Visible to users.">
                  <Switch checked={form.active} onCheckedChange={(v) => setF("active", v)} />
                </Row>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving || !form.title.trim()} className="gap-1.5">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editingId ? "Save" : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <Gift className="mx-auto mb-3 h-9 w-9 opacity-40" />
            No tasks yet. Create one to let users earn credits.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className={`flex items-center gap-3 rounded-lg border p-3 ${t.active ? "" : "opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.title}</span>
                    <Badge variant="secondary" className="text-[10px] capitalize">{t.platform}</Badge>
                    <Badge variant="outline" className="text-[10px]">+{t.reward_credits} cr</Badge>
                    {t.repeatable
                      ? <Badge variant="outline" className="text-[10px]">repeatable{t.cooldown_hours ? ` · ${t.cooldown_hours}h` : ""}</Badge>
                      : <Badge variant="outline" className="text-[10px]">once</Badge>}
                    {t.requires_review && <Badge variant="outline" className="text-[10px]">review</Badge>}
                    {!t.active && <Badge variant="destructive" className="text-[10px]">hidden</Badge>}
                  </div>
                  {t.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Review queue ── */}
      <TabsContent value="review" className="space-y-2">
        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <Inbox className="mx-auto mb-3 h-9 w-9 opacity-40" />
            Nothing waiting for review.
          </div>
        ) : pending.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{c.credit_tasks?.title ?? "Task"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {c.profiles?.name ?? c.profiles?.email ?? c.user_id} · +{c.credit_tasks?.reward_credits ?? 0} cr
                {c.proof_url && <> · <a href={c.proof_url} target="_blank" rel="noreferrer" className="underline">proof</a></>}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1 text-green-600" onClick={() => review(c.id, true)}><Check className="h-4 w-4" /> Approve</Button>
            <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => review(c.id, false)}><X className="h-4 w-4" /> Reject</Button>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div><Label>{label}</Label><p className="text-xs text-muted-foreground">{hint}</p></div>
      {children}
    </div>
  );
}
