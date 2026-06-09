"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface BillingData {
  billing_name:        string;
  billing_address:     string;
  billing_city:        string;
  billing_postal_code: string;
  billing_country:     string;
}

interface Props {
  initial: BillingData;
}

export function BillingSection({ initial }: Props) {
  const [editing, setEditing]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [data,    setData]      = useState<BillingData>(initial);
  const [draft,   setDraft]     = useState<BillingData>(initial);

  const hasBilling = !!(data.billing_address && data.billing_city);

  function field(key: keyof BillingData, label: string, placeholder?: string) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          value={draft[key]}
          placeholder={placeholder}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setData(draft);
      setEditing(false);
      toast.success("Billing address saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Billing address</p>
            {!hasBilling && (
              <p className="text-xs font-medium text-amber-400">Required for invoicing</p>
            )}
          </div>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => { setDraft(data); setEditing(true); }}
            className="gap-1.5 text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
            {hasBilling ? "Edit" : "Add"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 mt-2">
          <Separator />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="col-span-2">{field("billing_name", "Full name / Company", "Gipsz Jakab")}</div>
            <div className="col-span-2">{field("billing_address", "Street address", "Kossuth u. 1.")}</div>
            <div>{field("billing_postal_code", "Postal code", "1234")}</div>
            <div>{field("billing_city", "City", "Budapest")}</div>
            <div className="col-span-2">{field("billing_country", "Country", "Magyarország")}</div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : hasBilling ? (
        <div className="space-y-0.5 pl-11 text-sm">
          {data.billing_name && <p className="font-medium text-foreground">{data.billing_name}</p>}
          <p className="text-muted-foreground">{data.billing_address}</p>
          <p className="text-muted-foreground">{data.billing_postal_code} {data.billing_city}</p>
          {data.billing_country && <p className="text-muted-foreground">{data.billing_country}</p>}
        </div>
      ) : (
        <p className="pl-11 text-sm text-muted-foreground">Not set — needed for Billingo invoices</p>
      )}
    </div>
  );
}
