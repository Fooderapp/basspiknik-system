"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Save } from "lucide-react";
import type { TicketType } from "@/lib/supabase/types";

interface Props {
  eventId: string;
  ticketTypes: TicketType[];
}

export function SpinConfigManager({ eventId, ticketTypes }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [maxCartItems, setMaxCartItems] = useState(0);
  const [requireBundle, setRequireBundle] = useState(false);
  const [minBundles, setMinBundles] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}/spin-config`)
      .then((r) => r.json())
      .then((d) => {
        setEnabled(!!d.enabled);
        setAllowed(d.allowed_ticket_type_ids ?? []);
        setMaxCartItems(d.max_cart_items ?? 0);
        setRequireBundle(!!d.require_bundle);
        setMinBundles(d.min_bundles ?? 0);
      })
      .catch(() => {});
  }, [eventId]);

  const toggleType = (id: string) => {
    setAllowed((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/spin-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          allowedTicketTypeIds: allowed,
          maxCartItems,
          requireBundle,
          minBundles,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Spin settings saved");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const bundleTypes = ticketTypes.filter((t) => t.is_bundle);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Free Spin Conditions
        </CardTitle>
        <CardDescription>
          Let buyers spend credits on a slot-machine spin for a free checkout — only when the
          cart meets the conditions below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <Label>Enable spin for this event</Label>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); }} />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label>Eligible ticket types</Label>
              <p className="text-xs text-muted-foreground">
                Empty = any ticket type qualifies. Otherwise only carts made entirely of the
                selected types can spin.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {ticketTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                  >
                    <Badge variant={allowed.includes(t.id) ? "default" : "outline"} className="cursor-pointer">
                      {t.name}
                    </Badge>
                  </button>
                ))}
                {ticketTypes.length === 0 && (
                  <span className="text-xs text-muted-foreground">No ticket types yet.</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max items in cart (0 = no limit)</Label>
                <Input
                  type="number" min={0} value={maxCartItems}
                  onChange={(e) => { setMaxCartItems(Math.max(0, parseInt(e.target.value || "0", 10))); setDirty(true); }}
                />
              </div>
              <div className="space-y-2">
                <Label>Min bundles in cart</Label>
                <Input
                  type="number" min={0} value={minBundles}
                  onChange={(e) => { setMinBundles(Math.max(0, parseInt(e.target.value || "0", 10))); setDirty(true); }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Require a bundle in cart</Label>
                <p className="text-xs text-muted-foreground">
                  {bundleTypes.length === 0
                    ? "No bundle ticket types exist yet."
                    : `Bundle types: ${bundleTypes.map((b) => b.name).join(", ")}`}
                </p>
              </div>
              <Switch checked={requireBundle} onCheckedChange={(v) => { setRequireBundle(v); setDirty(true); }} />
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !dirty} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save spin settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
