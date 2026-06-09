"use client";

import { useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BannerImageUploaderProps {
  value?: string;
  onChange: (url: string | null) => void;
  className?: string;
}

// 4:1 banner. Stored at 2× for crisp PDF/retina rendering.
const TARGET_W = 960;
const TARGET_H = 240;

/** Resize + centre-crop to TARGET_W × TARGET_H, return a Blob. */
async function resizeToBanner(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const scale = Math.max(TARGET_W / img.width, TARGET_H / img.height);
      const sw = Math.round(img.width * scale);
      const sh = Math.round(img.height * scale);
      const sx = Math.round((sw - TARGET_W) / 2);
      const sy = Math.round((sh - TARGET_H) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = TARGET_W;
      canvas.height = TARGET_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, -sx, -sy, sw, sh);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function BannerImageUploader({ value, onChange, className }: BannerImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    try {
      const blob = await resizeToBanner(file);
      const filename = `banner-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("event-covers")
        .upload(filename, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("event-covers").getPublicUrl(filename);
      setPreview(data.publicUrl);
      onChange(data.publicUrl);
      toast.success("Banner uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleRemove = () => {
    setPreview(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      {preview ? (
        <div className="relative w-full overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: "4 / 1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Event banner" className="h-full w-full object-cover object-center" />
          <Button
            type="button" size="icon" variant="destructive"
            className="absolute top-2 right-2 h-7 w-7" onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[11px] text-white">
            480 × 120 (4:1)
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !uploading && inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
            "cursor-pointer bg-muted/40 transition-colors hover:bg-muted/70",
            uploading && "cursor-default opacity-60",
          )}
          style={{ aspectRatio: "4 / 1" }}
        >
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          ) : (
            <ImagePlus className="h-7 w-7 text-muted-foreground" />
          )}
          <div className="text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {uploading ? "Uploading…" : "Click or drag to upload banner"}
            </span>
            {!uploading && <p className="text-xs mt-0.5">Any size — auto-cropped to 480×120 (4:1)</p>}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
