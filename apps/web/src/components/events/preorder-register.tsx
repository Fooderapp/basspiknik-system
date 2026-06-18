"use client";

import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n";

interface PreorderRegisterProps {
  slug: string;
  dict: Dictionary;
  defaultEmail?: string;
  defaultName?: string;
}

export function PreorderRegister({ slug, dict, defaultEmail, defaultName }: PreorderRegisterProps) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [name, setName] = useState(defaultName ?? "");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${slug}/preorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Something went wrong");
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl py-8 px-6 text-center" style={{ background: "#9FE870" }}>
        <CheckCircle2 className="h-10 w-10" style={{ color: "#163300" }} strokeWidth={2} />
        <p className="font-bold text-lg" style={{ color: "#16170F" }}>{dict["preorder.success"]}</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl p-6 space-y-4" style={{ background: "#16170F" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#9FE870" }}>
          <Bell className="h-5 w-5" style={{ color: "#16170F" }} strokeWidth={2} />
        </div>
        <div>
          <p className="font-bold text-white">{dict["preorder.title"]}</p>
          <p className="text-xs text-white/60 mt-0.5">{dict["preorder.subtitle"]}</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-white/70 text-xs">{dict["preorder.name"]}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anna"
            className="bg-white/10 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#9FE870]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-white/70 text-xs">{dict["preorder.email"]} *</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="bg-white/10 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#9FE870]"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-full font-bold"
          style={{ background: "#9FE870", color: "#16170F" }}
        >
          <Bell className="h-4 w-4 mr-1.5" />
          {loading ? "…" : dict["preorder.cta"]}
        </Button>
      </form>
    </div>
  );
}
