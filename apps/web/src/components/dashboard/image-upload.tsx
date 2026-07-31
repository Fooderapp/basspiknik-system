"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value?: string | null;
  onChange: (url: string | null) => void;
  /** CSS aspect ratio for the preview box, e.g. "3/4" portrait, "16/9", "1/1". */
  aspect?: string;
  className?: string;
}

/** Longest edge kept on upload. Phone cameras produce 4000px+ / 6MB files;
 *  nothing in the UI renders wider than ~1920 CSS px, so storing the original
 *  only burns storage and egress. */
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.82;

/** Downscale (preserving aspect ratio) + re-encode to JPEG before upload.
 *  Returns the original file untouched if it is already small enough. */
async function compressImage(file: File): Promise<{ blob: Blob; contentType: string; ext: string }> {
  // Don't touch formats canvas would wreck (SVG) or that are already tiny.
  if (file.type === "image/svg+xml" || file.size < 200 * 1024) {
    return { blob: file, contentType: file.type, ext: file.name.split(".").pop()?.toLowerCase() || "jpg" };
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image"));
      el.src = bitmapUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    // Already within bounds and reasonably sized → keep as-is.
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      return { blob: file, contentType: file.type, ext: file.name.split(".").pop()?.toLowerCase() || "jpg" };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("Compression failed");
    // Safety: if compression somehow made it bigger, keep the original.
    if (blob.size >= file.size) {
      return { blob: file, contentType: file.type, ext: file.name.split(".").pop()?.toLowerCase() || "jpg" };
    }
    return { blob, contentType: "image/jpeg", ext: "jpg" };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/** Lightweight image uploader for CMS fields — uploads to the shared
 *  `event-covers` storage bucket and returns the public URL. No forced crop.
 *  Images are downscaled + re-encoded client-side first (egress/storage). */
export function ImageUpload({ value, onChange, aspect = "1/1", className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    setUploading(true);
    try {
      const { blob, contentType, ext } = await compressImage(file);
      const filename = `cms/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("event-covers").upload(filename, blob, { contentType, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("event-covers").getPublicUrl(filename);
      setPreview(data.publicUrl);
      onChange(data.publicUrl);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {preview ? (
        <div className="relative w-full overflow-hidden rounded-xl border bg-muted" style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => { setPreview(null); onChange(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/40 hover:bg-muted/70"
          style={{ aspectRatio: aspect }}
        >
          {uploading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : <ImagePlus className="h-7 w-7 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">{uploading ? "Uploading…" : "Click or drag to upload"}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}
