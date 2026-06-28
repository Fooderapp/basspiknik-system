"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

/** Camera QR scanner for reading a buyer's Bass-ID wallet pass at the web POS.
 *  Calls onResult with the decoded string once, then stops the stream. */
export function PassScanner({
  onResult,
  onClose,
  dict,
}: {
  onResult: (data: string) => void;
  onClose: () => void;
  dict: Dictionary;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    function tick() {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && !doneRef.current) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const qr = jsQR(img.data, c.width, c.height, { inversionAttempts: "dontInvert" });
          if (qr?.data) {
            doneRef.current = true;
            onResult(qr.data.trim());
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError(dict["checkin.camera_unavail"]);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setError(err instanceof Error ? err.message : dict["checkin.camera_unavail"]);
      }
    })();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">{dict["seller.scan_pass"]}</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-square bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/80">{error}</div>
          ) : (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
            </>
          )}
        </div>
        <p className="px-4 py-3 text-center text-xs text-muted-foreground">{dict["seller.scan_pass_hint"]}</p>
      </div>
    </div>
  );
}
