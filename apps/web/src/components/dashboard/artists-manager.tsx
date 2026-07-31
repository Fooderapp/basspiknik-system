"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Star, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/dashboard/image-upload";
import { imgUrl, IMG } from "@/lib/image";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Artist {
  id: string; slug: string; name: string; genre: string | null; bio: string | null;
  photo_url: string | null; socials: Record<string, string>; featured: boolean; sort_order: number; active: boolean;
  event_ids: string[];
}

interface EventOption { id: string; name: string; slug: string; }

const SOCIAL_KEYS = ["instagram", "soundcloud", "spotify", "facebook", "website"];
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const empty = (): Partial<Artist> => ({ name: "", slug: "", genre: "", bio: "", photo_url: null, socials: {}, featured: false, sort_order: 0, active: true, event_ids: [] });

export function ArtistsManager() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Artist> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [artistRes, eventRes] = await Promise.all([
        fetch("/api/admin/artists"),
        fetch("/api/admin/events"),
      ]);
      const ad = await artistRes.json();
      const ed = await eventRes.json();
      setArtists(ad.artists ?? []);
      setEvents((ed.events ?? []).map((e: any) => ({ id: e.id, name: e.name, slug: e.slug })));
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!editing?.name?.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const body = {
        id: editing.id,
        name: editing.name,
        slug: editing.slug?.trim() || slugify(editing.name),
        genre: editing.genre || null,
        bio: editing.bio || null,
        photoUrl: editing.photo_url || null,
        socials: editing.socials ?? {},
        featured: !!editing.featured,
        sortOrder: editing.sort_order ?? 0,
        active: editing.active ?? true,
        eventIds: editing.event_ids ?? [],
      };
      const r = await fetch("/api/admin/artists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      toast.success("Saved");
      setEditing(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this artist?")) return;
    const r = await fetch(`/api/admin/artists?id=${id}`, { method: "DELETE" });
    if (r.ok) setArtists((a) => a.filter((x) => x.id !== id)); else toast.error("Failed");
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Artists</h1>
          <p className="text-muted-foreground mt-1">Manage the lineup shown on the public site.</p>
        </div>
        <Button className="rounded-full px-6 gap-2" onClick={() => setEditing(empty())}><Plus className="h-4 w-4" />New artist</Button>
      </div>

      {/* Editor */}
      {editing && (
        <div className="rounded-3xl bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-lg">{editing.id ? "Edit artist" : "New artist"}</h2>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <ImageUpload aspect="3/4" value={editing.photo_url ?? null} onChange={(url) => setEditing((e) => ({ ...e!, photo_url: url }))} />
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, name: e.target.value, slug: p!.slug || slugify(e.target.value) }))} /></div>
                <div className="space-y-1.5"><Label>Slug</Label><Input value={editing.slug ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, slug: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>Genre</Label><Input value={editing.genre ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, genre: e.target.value }))} placeholder="e.g. Techno · House" /></div>
              <div className="space-y-1.5"><Label>Bio</Label><Textarea rows={4} value={editing.bio ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, bio: e.target.value }))} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SOCIAL_KEYS.map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label className="capitalize">{k}</Label>
                    <Input value={editing.socials?.[k] ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, socials: { ...(p!.socials ?? {}), [k]: e.target.value } }))} placeholder="https://…" />
                  </div>
                ))}
              </div>
              {events.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Linked Events</Label>
                  <div className="flex flex-wrap gap-2">
                    {events.map((ev) => {
                      const selected = (editing.event_ids ?? []).includes(ev.id);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setEditing((p) => {
                            const ids = p!.event_ids ?? [];
                            return { ...p!, event_ids: selected ? ids.filter((id) => id !== ev.id) : [...ids, ev.id] };
                          })}
                          className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                          style={{
                            background: selected ? "#9FE870" : "rgba(0,0,0,0.08)",
                            color: selected ? "#16170F" : "#555",
                          }}
                        >
                          {ev.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" style={{ accentColor: "#163300" }} checked={!!editing.featured} onChange={(e) => setEditing((p) => ({ ...p!, featured: e.target.checked }))} />Featured</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" style={{ accentColor: "#163300" }} checked={editing.active ?? true} onChange={(e) => setEditing((p) => ({ ...p!, active: e.target.checked }))} />Active</label>
                <div className="flex items-center gap-2 text-sm"><Label className="m-0">Order</Label><Input type="number" className="h-8 w-20" value={editing.sort_order ?? 0} onChange={(e) => setEditing((p) => ({ ...p!, sort_order: parseInt(e.target.value || "0", 10) }))} /></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="rounded-full px-6" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : artists.length === 0 ? (
        <p className="text-muted-foreground text-sm">No artists yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((a) => (
            <div key={a.id} className="rounded-3xl bg-card p-3 shadow-sm">
              <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-muted">
                {a.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl(a.photo_url, IMG.thumb)} alt={a.name} className="h-full w-full object-cover" />
                ) : <div className="flex h-full items-center justify-center"><Music className="h-8 w-8 text-muted-foreground/40" /></div>}
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold flex items-center gap-1">{a.featured && <Star className="h-3.5 w-3.5" style={{ color: "#163300", fill: "#9FE870" }} />}{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.genre || a.slug}{!a.active && " · hidden"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
