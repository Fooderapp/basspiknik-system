"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, GripVertical, ChevronDown, ChevronUp, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/dashboard/image-upload";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { imgUrl, IMG } from "@/lib/image";

/* eslint-disable @typescript-eslint/no-explicit-any */

const POSITRON = "https://tiles.openfreemap.org/styles/positron";

/** Small interactive map — click anywhere to set lat/lng */
function LocationPickerMap({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: POSITRON,
      center: [lng, lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const marker = new maplibregl.Marker({ color: "#163300", draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);
    markerRef.current = marker;

    marker.on("dragend", () => {
      const { lat: lt, lng: ln } = marker.getLngLat();
      onChange(Math.round(lt * 1e7) / 1e7, Math.round(ln * 1e7) / 1e7);
    });

    map.on("click", (e) => {
      const lt = Math.round(e.lngLat.lat * 1e7) / 1e7;
      const ln = Math.round(e.lngLat.lng * 1e7) / 1e7;
      marker.setLngLat([ln, lt]);
      onChange(lt, ln);
    });

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  // only mount once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep marker in sync when lat/lng change from the inputs
  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
    mapRef.current?.setCenter([lng, lat]);
  }, [lat, lng]);

  return <div ref={containerRef} style={{ height: 240, borderRadius: 16, overflow: "hidden" }} />;
}

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
  event_id: string | null;
  pin_svg: string | null;
}

interface EventOption { id: string; name: string; }

const EMPTY: Omit<MapVenue, "id" | "sort_order"> = {
  name: "",
  lat: 47.3975366,
  lng: 16.535894,
  maps_url: "",
  description_hu: "",
  description_en: "",
  images: [],
  active: true,
  event_id: null,
  pin_svg: null,
};

/** Strip-style multi-image manager — thumbnails + "add another" uploader */
function ImagesField({
  images,
  onChange,
}: {
  images: string[];
  onChange: (imgs: string[]) => void;
}) {
  const [uploadKey, setUploadKey] = useState(0);

  function addImage(url: string | null) {
    if (!url) return;
    onChange([...images, url]);
    setUploadKey((k) => k + 1); // reset uploader so user can add more
  }

  function removeImage(idx: number) {
    onChange(images.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <Label>Images</Label>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, idx) => (
            <div key={url + idx} className="group relative h-20 w-20 overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl(url, IMG.thumb)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
              {idx === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 text-center text-[9px] text-white">cover</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="max-w-[80px]">
        <ImageUpload key={uploadKey} aspect="1/1" value={null} onChange={addImage} />
        <p className="mt-1 text-[10px] text-muted-foreground">Add photo</p>
      </div>
    </div>
  );
}

/** Upload an SVG file → reads it as text and stores raw SVG string */
function SvgPinField({ value, onChange }: { value: string | null; onChange: (svg: string | null) => void }) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string ?? "").trim();
      if (!text.includes("<svg")) { toast.error("File must be an SVG"); return; }
      onChange(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <Label>Custom Pin SVG</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <>
            <div
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border bg-muted"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: value }}
              style={{ maxWidth: 64, maxHeight: 64 }}
            />
            <div className="flex flex-col gap-1">
              <label className="cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                Replace
                <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={handleFile} />
              </label>
              <button type="button" onClick={() => onChange(null)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                Remove
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Custom pin active</p>
          </>
        ) : (
          <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            Upload SVG pin
            <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={handleFile} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Leave empty to use the default Bass Piknik pin.</p>
    </div>
  );
}

export function VenuesManager() {
  const [venues, setVenues] = useState<MapVenue[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, Partial<MapVenue>>>({});

  async function load() {
    try {
      const [venueRes, eventRes] = await Promise.all([
        fetch("/api/admin/venues"),
        fetch("/api/admin/events"),
      ]);
      const vd = await venueRes.json();
      const ed = await eventRes.json();
      setVenues(vd.venues ?? []);
      setEvents((ed.events ?? []).map((e: any) => ({ id: e.id, name: e.name })));
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
    setEditDrafts((d) => ({ ...d, [v.id]: { name: v.name, lat: v.lat, lng: v.lng, maps_url: v.maps_url, description_hu: v.description_hu, description_en: v.description_en, images: [...v.images], event_id: v.event_id ?? null, pin_svg: v.pin_svg ?? null } }));
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
              <div className="col-span-2 space-y-1.5">
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Place on map</Label>
                <p className="text-xs text-muted-foreground">Click or drag the pin to set the position.</p>
                <LocationPickerMap lat={draft.lat} lng={draft.lng} onChange={(lt, ln) => setDraft((d) => ({ ...d, lat: lt, lng: ln }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Google Maps URL</Label>
                <Input value={draft.maps_url} onChange={(e) => setDraft((d) => ({ ...d, maps_url: e.target.value }))} placeholder="https://maps.google.com/..." />
              </div>
              {events.length > 0 && (
                <div className="col-span-2 space-y-1">
                  <Label>Linked Event (for "Buy Tickets" CTA)</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={draft.event_id ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, event_id: e.target.value || null }))}
                  >
                    <option value="">— None —</option>
                    {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2 space-y-1">
                <Label>Description (Hungarian)</Label>
                <Textarea rows={3} value={draft.description_hu} onChange={(e) => setDraft((d) => ({ ...d, description_hu: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description (English)</Label>
                <Textarea rows={3} value={draft.description_en} onChange={(e) => setDraft((d) => ({ ...d, description_en: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <ImagesField images={draft.images} onChange={(imgs) => setDraft((d) => ({ ...d, images: imgs }))} />
              </div>
              <div className="col-span-2">
                <SvgPinField value={draft.pin_svg} onChange={(svg) => setDraft((d) => ({ ...d, pin_svg: svg }))} />
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
            const edImages = (ed.images ?? v.images) as string[];
            return (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-none" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.lat}, {v.lng} · {v.images.length} image{v.images.length !== 1 ? "s" : ""}</p>
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
                        <div className="col-span-2 space-y-1.5">
                          <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Place on map</Label>
                          <p className="text-xs text-muted-foreground">Click or drag the pin to set the position.</p>
                          <LocationPickerMap
                            lat={(ed.lat ?? v.lat) as number}
                            lng={(ed.lng ?? v.lng) as number}
                            onChange={(lt, ln) => { patchEdit(v.id, "lat", lt); patchEdit(v.id, "lng", ln); }}
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>Google Maps URL</Label>
                          <Input value={(ed.maps_url ?? v.maps_url) as string} onChange={(e) => patchEdit(v.id, "maps_url", e.target.value)} />
                        </div>
                        {events.length > 0 && (
                          <div className="col-span-2 space-y-1">
                            <Label>Linked Event (for "Buy Tickets" CTA)</Label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                              value={(ed.event_id ?? v.event_id) ?? ""}
                              onChange={(e) => patchEdit(v.id, "event_id", e.target.value || null)}
                            >
                              <option value="">— None —</option>
                              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="col-span-2 space-y-1">
                          <Label>Description (Hungarian)</Label>
                          <Textarea rows={3} value={(ed.description_hu ?? v.description_hu) as string} onChange={(e) => patchEdit(v.id, "description_hu", e.target.value)} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label>Description (English)</Label>
                          <Textarea rows={3} value={(ed.description_en ?? v.description_en) as string} onChange={(e) => patchEdit(v.id, "description_en", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <ImagesField images={edImages} onChange={(imgs) => patchEdit(v.id, "images", imgs)} />
                        </div>
                        <div className="col-span-2">
                          <SvgPinField value={(ed.pin_svg ?? v.pin_svg) as string | null} onChange={(svg) => patchEdit(v.id, "pin_svg", svg)} />
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
