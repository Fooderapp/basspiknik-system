"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Coins, CalendarDays, LinkIcon, MessageSquare, XCircle, CameraOff, type LucideIcon } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface QrResult {
  ok?: boolean;
  type?: "ONE_TIME_CREDIT" | "OPEN_EVENT" | "LINK" | "MESSAGE";
  credits?: number; balance?: number;
  eventId?: string | null; eventSlug?: string | null;
  url?: string | null; message?: string | null; label?: string | null;
  error?: string;
}

const ERR: Record<string, string> = {
  auth: "Please sign in first.",
  not_found: "This code isn't valid.",
  exhausted: "This code has been fully used.",
  already: "You've already used this code.",
};
const RESULT_ICON: Record<string, LucideIcon> = {
  ONE_TIME_CREDIT: Coins, OPEN_EVENT: CalendarDays, LINK: LinkIcon, MESSAGE: MessageSquare,
};

export function QrScanClient() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<QrResult | null>(null);
  const [denied, setDenied] = useState(false);
  const busy = useRef(false);
  const resultRef = useRef<QrResult | null>(null);
  resultRef.current = result;

  async function redeem(code: string) {
    if (busy.current || !code.trim()) return;
    busy.current = true;
    try {
      const res = await fetch("/api/qr/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await res.json();
      if (!res.ok) setResult({ error: d.error ?? "not_found" });
      else setResult(d);
    } catch { setResult({ error: "not_found" }); }
    finally { setTimeout(() => { busy.current = false; }, 800); }
  }

  // Live camera scan, decoded with jsQR via a canvas — works in every browser
  // that supports getUserMedia (incl. iOS Safari, which lacks BarcodeDetector).
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current;
        if (v) { v.srcObject = stream; v.setAttribute("playsinline", "true"); await v.play(); }
        const tick = () => {
          const vid = videoRef.current;
          if (vid && vid.readyState === 4 && ctx && !resultRef.current && !busy.current) {
            canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (found?.data) void redeem(found.data);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch { setDenied(true); }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  function act() {
    const r = result; setResult(null);
    if (!r?.ok) return;
    if (r.type === "OPEN_EVENT" && r.eventSlug) router.push(`/events/${r.eventSlug}`);
    else if (r.type === "LINK" && r.url) window.location.href = r.url;
  }

  const ok = result?.ok;
  const Icon = ok && result?.type ? RESULT_ICON[result.type] : XCircle;
  const head = !result ? "" : !ok ? "Couldn't scan"
    : result.type === "ONE_TIME_CREDIT" ? `+${result.credits} credits!`
    : result.type === "OPEN_EVENT" ? "Event found"
    : result.type === "LINK" ? "Link ready"
    : (result.label ?? "Scanned");
  const sub = !result ? null : !ok ? (ERR[result.error ?? ""] ?? "Try again.")
    : result.type === "ONE_TIME_CREDIT" ? `Balance: ${result.balance} credits`
    : result.type === "MESSAGE" ? result.message
    : result.type === "OPEN_EVENT" ? "Tap to view the event."
    : result.type === "LINK" ? "Tap to open." : null;
  const actLabel = result?.type === "OPEN_EVENT" ? "View event" : result?.type === "LINK" ? "Open" : "Done";

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6 md:py-10">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Scan</h1>
      <p className="text-muted-foreground mt-1 mb-5">Scan a BassPiknik QR for credits, events and more.</p>

      {/* Camera viewport */}
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black shadow-sm">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {/* frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative" style={{ width: "62%", height: "62%" }}>
            {[["top-0 left-0","border-t-4 border-l-4 rounded-tl-[26px]"],["top-0 right-0","border-t-4 border-r-4 rounded-tr-[26px]"],["bottom-0 left-0","border-b-4 border-l-4 rounded-bl-[26px]"],["bottom-0 right-0","border-b-4 border-r-4 rounded-br-[26px]"]].map(([pos,b],i)=>(
              <span key={i} className={`absolute h-11 w-11 border-white ${pos} ${b}`} />
            ))}
          </div>
        </div>
        {denied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center text-white">
            <CameraOff className="h-8 w-8" />
            <p className="text-sm">Allow camera access to scan a QR code.</p>
          </div>
        )}
      </div>

      {/* Result sheet */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setResult(null)}>
          <div className="w-full max-w-md rounded-t-3xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full" style={{ background: "#E2E0D4" }} />
            <div className="flex items-center gap-3">
              <span className="flex h-13 w-13 items-center justify-center rounded-full" style={{ width: 52, height: 52, background: ok ? "var(--pastel-green)" : "var(--pastel-rose)" }}>
                <Icon className="h-6 w-6" style={{ color: ok ? "#2C3A18" : "#4A1820" }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">{head}</p>
                {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
              </div>
            </div>
            <button onClick={act} className="mt-5 w-full rounded-2xl py-3.5 font-bold text-white" style={{ background: "#16170F" }}>
              {actLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
