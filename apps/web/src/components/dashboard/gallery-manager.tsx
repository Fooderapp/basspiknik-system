"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/dashboard/image-upload";
import { imgUrl, IMG } from "@/lib/image";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Img { id: string; image_url: string; caption: string | null; sort_order: number; }

export function GalleryManager() {
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const d = await (await fetch("/api/admin/gallery")).json();
      setImages(d.images ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function add(url: string | null) {
    if (!url) return;
    const r = await fetch("/api/admin/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: url, sortOrder: images.length }) });
    if (r.ok) { toast.success("Added"); await load(); } else toast.error("Failed");
  }

  async function remove(id: string) {
    const r = await fetch(`/api/admin/gallery?id=${id}`, { method: "DELETE" });
    if (r.ok) setImages((x) => x.filter((i) => i.id !== id)); else toast.error("Failed");
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Gallery</h1>
        <p className="text-muted-foreground mt-1">Photos shown on the homepage gallery.</p>
      </div>

      <div className="max-w-xs">
        <ImageUpload aspect="1/1" value={null} onChange={add} />
        <p className="mt-1 text-xs text-muted-foreground">Upload to add a photo.</p>
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : images.length === 0 ? (
        <p className="text-muted-foreground text-sm">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl(img.image_url, IMG.thumb)} alt="" className="h-full w-full object-cover" />
              <Button size="icon" variant="destructive" className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => remove(img.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
