"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Gift, Instagram, Facebook, Youtube, Check, Clock, Hourglass, ExternalLink, type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Task {
  id: string;
  title: string;
  description: string | null;
  platform: string;
  url: string | null;
  ctaLabel: string;
  reward: number;
  repeatable: boolean;
  requiresReview: boolean;
  state: "available" | "done" | "pending" | "cooldown";
  cooldownLeftMs: number;
}

const ICON: Record<string, LucideIcon> = {
  instagram: Instagram, facebook: Facebook, youtube: Youtube,
};

export function TaskList({ dict }: { dict: Dictionary }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<Record<string, boolean>>({}); // url tasks: opened, awaiting confirm

  async function load() {
    try {
      const res = await fetch("/api/tasks");
      const d = await res.json();
      setTasks(d.tasks ?? []);
    } catch { /* ignore */ } finally { setLoaded(true); }
  }
  useEffect(() => { void load(); }, []);

  async function claim(t: Task) {
    setBusy(t.id);
    try {
      const res = await fetch("/api/tasks/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: t.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      if (d.status === "PENDING") toast.success(dict["tasks.submitted"]);
      else toast.success(`+${d.credits} ⭐`);
      setArmed((a) => ({ ...a, [t.id]: false }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  }

  function onCta(t: Task) {
    // URL tasks: first tap opens the link, second tap confirms (honor step).
    if (t.url && !armed[t.id]) {
      window.open(t.url, "_blank", "noopener");
      setArmed((a) => ({ ...a, [t.id]: true }));
      return;
    }
    void claim(t);
  }

  if (!loaded || tasks.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Gift className="h-5 w-5 text-gold" />
        <h2 className="text-lg font-bold tracking-tight">{dict["tasks.title"]}</h2>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => {
          const Icon = ICON[t.platform] ?? Gift;
          const done = t.state === "done";
          const pending = t.state === "pending";
          const cooldown = t.state === "cooldown";
          const locked = done || pending || cooldown;
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug line-clamp-2">{t.title}</p>
                {t.description && <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
              </div>
              <Badge variant="secondary" className="shrink-0 text-[11px]">+{t.reward} ⭐</Badge>

              {done ? (
                <span className="flex items-center gap-1 text-xs font-medium text-brand"><Check className="h-4 w-4" />{dict["tasks.done"]}</span>
              ) : pending ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Hourglass className="h-3.5 w-3.5" />{dict["tasks.pending"]}</span>
              ) : cooldown ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />{dict["tasks.cooldown"]}</span>
              ) : (
                <Button size="sm" disabled={busy === t.id} onClick={() => onCta(t)} className="shrink-0 gap-1.5">
                  {t.url && !armed[t.id] && <ExternalLink className="h-3.5 w-3.5" />}
                  {armed[t.id] ? dict["tasks.i_did_it"] : t.ctaLabel}
                </Button>
              )}
              {locked && <span className="w-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
