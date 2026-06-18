"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send, Mail, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Dictionary } from "@/lib/i18n";

interface Props {
  dict: Dictionary;
  events: Array<{ id: string; name: string }>;
}

export function NotificationSender({ dict, events }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audience, setAudience] = useState<"all_push" | "event_preorders">("all_push");
  const [eventId, setEventId] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  async function send() {
    const channels: string[] = [];
    if (emailEnabled) channels.push("email");
    if (pushEnabled) channels.push("push");
    if (channels.length === 0) { toast.error("Select at least one channel"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body required"); return; }
    if (audience === "event_preorders" && !eventId) { toast.error("Select an event"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          ctaText: ctaText.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
          channels,
          audience,
          eventId: eventId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? dict["notif.error"]); return; }
      toast.success(`${dict["notif.success"]} · ${data.emailsSent} emails · ${data.pushSent} push`);
      setSubject("");
      setBody("");
      setCtaText("");
      setCtaUrl("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Subject */}
        <div className="space-y-2">
          <Label>{dict["notif.subject"]}</Label>
          <Input
            placeholder="🎉 Tickets on sale now!"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* Body */}
        <div className="space-y-2">
          <Label>{dict["notif.body"]}</Label>
          <Textarea
            placeholder="Hey! Tickets for the event are now available. Get yours before they sell out…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground text-right">{body.length}/2000</p>
        </div>

        {/* CTA — shown for both channels; push uses url as deeplink, email renders button */}
        <div className="rounded-xl border border-dashed p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CTA / Link (optional)</p>
          <div className="space-y-2">
            <Label className="text-xs">{dict["notif.cta_url"]}</Label>
            <Input
              placeholder={dict["notif.url_placeholder"]}
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Push: opens this URL when notification is tapped. Email: shown as button below.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{dict["notif.cta_text"]} <span className="text-muted-foreground">(email only)</span></Label>
            <Input
              placeholder={dict["notif.cta_placeholder"]}
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              maxLength={100}
              disabled={!ctaUrl}
            />
          </div>
          {/* Preview */}
          {ctaText && ctaUrl && (
            <div className="pt-1">
              <span className="inline-block rounded-full px-5 py-2 text-sm font-bold" style={{ background: "#9FE870", color: "#16170F" }}>
                {ctaText}
              </span>
              <p className="mt-1 text-xs text-muted-foreground truncate">{ctaUrl}</p>
            </div>
          )}
        </div>

        {/* Audience */}
        <div className="space-y-2">
          <Label>{dict["notif.audience"]}</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_push">{dict["notif.audience_all"]}</SelectItem>
              <SelectItem value="event_preorders">{dict["notif.audience_event"]}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {audience === "event_preorders" && (
          <div className="space-y-2">
            <Label>{dict["notif.select_event"]}</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder="— select —" /></SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Channels */}
        <div className="space-y-2">
          <Label>{dict["notif.channels"]}</Label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setEmailEnabled((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                emailEnabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Mail className="h-4 w-4" />
              {dict["notif.channel_email"]}
            </button>
            <button
              type="button"
              onClick={() => setPushEnabled((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                pushEnabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              {dict["notif.channel_push"]}
            </button>
          </div>
        </div>

        <Button onClick={send} disabled={loading} className="w-full gap-2">
          <Send className="h-4 w-4" />
          {loading ? dict["notif.sending"] : dict["notif.send"]}
        </Button>
      </CardContent>
    </Card>
  );
}
