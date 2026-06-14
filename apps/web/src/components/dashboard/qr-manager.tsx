"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, CalendarDays, LinkIcon, MessageSquare, Copy, Download, Trash2, Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* eslint-disable @typescript-eslint/no-explicit-any */

type QrType = "ONE_TIME_CREDIT" | "OPEN_EVENT" | "LINK" | "MESSAGE";

interface QrRow {
  id: string;
  code: string;
  type: QrType;
  label: string | null;
  credit_amount: number;
  event_id: string | null;
  url: string | null;
  message: string | null;
  max_uses: number;
  per_user_once: boolean;
  uses: number;
  active: boolean;
  events?: { name: string } | null;
}

const TYPES: { value: QrType; label: string; icon: LucideIcon; hint: string }[] = [
  { value: "ONE_TIME_CREDIT", label: "One-time credit", icon: Coins, hint: "Grant credits, once per user" },
  { value: "OPEN_EVENT", label: "Open event", icon: CalendarDays, hint: "Deep-link to an event page" },
  { value: "LINK", label: "Link", icon: LinkIcon, hint: "Open any URL / in-app path" },
  { value: "MESSAGE", label: "Message", icon: MessageSquare, hint: "Show an announcement" },
];

const TYPE_ICON: Record<QrType, LucideIcon> = {
  ONE_TIME_CREDIT: Coins, OPEN_EVENT: CalendarDays, LINK: LinkIcon, MESSAGE: MessageSquare,
};

// Encode a deep link (https://<app>/r/<code>) so a phone's default camera can
// scan it and open the redeem page — not just the in-app scanner.
function deepLink(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/r/${code}`;
}
function qrSrc(code: string) {
  return `/api/tickets/qr?code=${encodeURIComponent(deepLink(code))}`;
}

export function QrManager({ events }: { events: { id: string; name: string }[] }) {
  const [codes, setCodes] = useState<QrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<QrType>("ONE_TIME_CREDIT");
  const [label, setLabel] = useState("");
  const [creditAmount, setCreditAmount] = useState(10);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [maxUses, setMaxUses] = useState(0);
  const [perUserOnce, setPerUserOnce] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/admin/qr");
      const d = await res.json();
      setCodes(d.codes ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, label, creditAmount, eventId, url, message, maxUses, perUserOnce }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success("QR code created");
      setLabel(""); setUrl(""); setMessage("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this QR code? Existing prints will stop working.")) return;
    try {
      const res = await fetch(`/api/admin/qr?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setCodes((c) => c.filter((x) => x.id !== id));
    } catch { toast.error("Failed to delete"); }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>QR Codes</h1>
        <p className="text-muted-foreground mt-1">Generate scannable codes for credits, events, links and announcements.</p>
      </div>

      {/* Create form */}
      <div className="rounded-3xl bg-card p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-lg">New code</h2>

        {/* Type picker */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className="rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5"
                style={{
                  background: active ? "var(--pastel-green)" : "var(--secondary, #ECEADD)",
                  outline: active ? "2px solid #163300" : "none",
                }}
              >
                <Icon className="h-5 w-5 mb-1" style={{ color: active ? "#163300" : "#6B6F63" }} />
                <p className="text-sm font-bold">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </button>
            );
          })}
        </div>

        {/* Common: label */}
        <div className="space-y-1.5">
          <Label htmlFor="qr-label">Label (admin only)</Label>
          <Input id="qr-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Festival flyer credit" />
        </div>

        {/* Type-specific */}
        {type === "ONE_TIME_CREDIT" && (
          <div className="space-y-1.5">
            <Label htmlFor="qr-credit">Credit amount</Label>
            <Input id="qr-credit" type="number" min={1} value={creditAmount} onChange={(e) => setCreditAmount(parseInt(e.target.value || "0", 10))} />
          </div>
        )}
        {type === "OPEN_EVENT" && (
          <div className="space-y-1.5">
            <Label htmlFor="qr-event">Event</Label>
            <select id="qr-event" value={eventId} onChange={(e) => setEventId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
        )}
        {type === "LINK" && (
          <div className="space-y-1.5">
            <Label htmlFor="qr-url">URL</Label>
            <Input id="qr-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
        )}
        {type === "MESSAGE" && (
          <div className="space-y-1.5">
            <Label htmlFor="qr-msg">Message</Label>
            <Input id="qr-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shown when scanned" />
          </div>
        )}

        {/* Usage limits */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qr-max">Max total uses (0 = ∞)</Label>
            <Input id="qr-max" type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(parseInt(e.target.value || "0", 10))} />
          </div>
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input type="checkbox" checked={perUserOnce} onChange={(e) => setPerUserOnce(e.target.checked)} className="h-4 w-4" style={{ accentColor: "#163300" }} />
            One redemption per user
          </label>
        </div>

        <Button onClick={create} disabled={saving} className="rounded-full px-6 gap-2">
          <Plus className="h-4 w-4" />{saving ? "Creating…" : "Create QR code"}
        </Button>
      </div>

      {/* Existing codes */}
      <div className="space-y-3">
        <h2 className="font-bold text-lg">Existing codes</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : codes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No codes yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {codes.map((c) => {
              const Icon = TYPE_ICON[c.type];
              return (
                <div key={c.id} className="flex gap-4 rounded-3xl bg-card p-4 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc(c.code)} alt={c.code} width={96} height={96} className="h-24 w-24 rounded-xl bg-white p-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {TYPES.find((t) => t.value === c.type)?.label}
                    </div>
                    <p className="truncate font-bold">{c.label || c.events?.name || c.message || c.url || "—"}</p>
                    <p className="font-mono text-sm">{c.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.type === "ONE_TIME_CREDIT" && `+${c.credit_amount} credits · `}
                      {c.uses} used{c.max_uses > 0 ? ` / ${c.max_uses}` : ""}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="secondary" className="h-8 gap-1 rounded-full"
                        onClick={() => { navigator.clipboard.writeText(deepLink(c.code)); toast.success("Link copied"); }}>
                        <Copy className="h-3.5 w-3.5" />Copy
                      </Button>
                      <a href={qrSrc(c.code)} download={`qr-${c.code}.png`}>
                        <Button size="sm" variant="secondary" className="h-8 gap-1 rounded-full">
                          <Download className="h-3.5 w-3.5" />PNG
                        </Button>
                      </a>
                      <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-full text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
