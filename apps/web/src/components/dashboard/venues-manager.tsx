"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MapVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  maps_url: string;
  description_hu: string;
  description_en: string;
  images: string[];
  active: boolean;
  sort_order: number;
}

const EMPTY: Omit<MapVenue, "id" | "sort_order"> = {
  name: "",
  lat: 47.3975366,
  lng: 16.535894,
  maps_url: "",
  description_hu: "",
  description_en: "",
  images: [],
  active: true,
};

export function VenuesManager() {
  const [venues, setVenues] = useState<MapVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, Partial<MapVenue>>>({});

  async function load() {
    try {
      const d = await (await fetch("/api/admin/venues")).json();
      setVenues(d.venues ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    if (!draft.name || !draft.lat || !draft.lng) { toast.error("Name, lat and lng are required"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/venues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, sort_order: venues.length }) });
      if (r.ok) { toast.success("Venue added"); setAdding(false); setDraft({ ...EMPTY }); await load(); }
      else toast.error("Failed to add venue");
    } finally { setSaving(false); }
  }

  async function update(id: string) {
    const patch = editDrafts[id];
    if (!patch) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/venues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (r.ok) { toast.success("Saved"); setExpanded(null); await load(); }
      else toast.error("Failed to save");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this venue?")) return;
    const r = await fetch(`/api/admin/venues/${id}`, { method: "DELETE" });
    if (r.ok) { setVenues((v) => v.filter((x) => x.id !== id)); toast.success("Deleted"); }
    else toast.error("Failed");
  }

  async function toggleActive(venue: MapVenue) {
    const r = await fetch(`/api/admin/venues/${venue.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !venue.active }) });
    if (r.ok) await load(); else toast.error("Failed");
  }

  function startEdit(v: MapVenue) {
    setEditDrafts((d) => ({ ...d, [v.id]: { name: v.name, lat: v.lat, lng: v.lng, maps_url: v.maps_url, description_hu: v.description_hu, description_en: v.description_en } }));
    setExpanded(v.id);
  }

  function patchEdit(id: string, key: string, value: any) {
    setEditDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Map Pins</h1>
          <p className="text-muted-foreground mt-1">Manage map markers and popup content shown on the homepage.</p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="mr-2 h-4 w-4" /> Add Venue
        </Button>
      </div>

      {/* ── Add form ── */}
      {adding && (
        <Card>
          <CardHeader><CardTitle>New Venue</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Venue name" />
              </div>
              <div className="space-y-1">
                <Label>Latitude</Label>
                <Input type="number" step="any" value={draft.lat} onChange={(e) => setDraft((d) => ({ ...d, lat: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label>Longitude</Label>
                <Input type="number" step="any" value={draft.lng} onChange={(e) => setDraft((d) => ({ ...d, lng: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Google Maps URL</Label>
                <Input value={draft.maps_url} onChange={(e) => setDraft((d) => ({ ...d, maps_url: e.target.value }))} placeholder="https://maps.google.com/..." />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description (Hungarian)</Label>
                <Textarea rows={3} value={draft.description_hu} onChange={(e) => setDraft((d) => ({ ...d, description_hu: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description (English)</Label>
                <Textarea rows={3} value={draft.description_en} onChange={(e) => setDraft((d) => ({ ...d, description_en: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={create} disabled={saving}>Save</Button>
              <Button variant="outline" onClick={() => { setAdding(false); setDraft({ ...EMPTY }); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Venue list ── */}
      {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : venues.length === 0 ? (
        <p className="text-muted-foreground text-sm">No venues yet.</p>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => {
            const isOpen = expanded === v.id;
            const ed = editDrafts[v.id] ?? {};
            return (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-none" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.lat}, {v.lng}</p>
                    </div>
                    <Switch checked={v.active} onCheckedChange={() => toggleActive(v)} />
                    <Button size="sm" variant="ghost" onClick={() => isOpen ? setExpanded(null) : startEdit(v)}>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(v.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1">
                          <Label>Name</Label>
                          <Input value={(ed.name ?? v.name) as string} onChange={(e) => patchEdit(v.id, "name", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Latitude</Label>
                          <Input type="number" step="any" value={(ed.lat ?? v.lat) as number} onChange={(e) => patchEdit(v.id, "lat", parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Longitude</Label>
                          <Input type="number" step="any" value={(ed.lng ?? v.lng) as number} onChange={(e) => patchEdit(v.id, "lng", parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>Google Maps URL</Label>
                          <Input value={(ed.maps_url ?? v.maps_url) as string} onChange={(e) => patchEdit(v.id, "maps_url", e.target.value)} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>Description (Hungarian)</Label>
                          <Textarea rows={3} value={(ed.description_hu ?? v.description_hu) as string} onChange={(e) => patchEdit(v.id, "description_hu", e.target.value)} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>Description (English)</Label>
                          <Textarea rows={3} value={(ed.description_en ?? v.description_en) as string} onChange={(e) => patchEdit(v.id, "description_en", e.target.value)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => update(v.id)} disabled={saving}>Save changes</Button>
                        <Button size="sm" variant="outline" onClick={() => setExpanded(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
