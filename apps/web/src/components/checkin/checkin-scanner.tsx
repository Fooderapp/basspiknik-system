"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Flashlight, FlashlightOff, ScanLine, Keyboard, RotateCcw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";
import jsQR from "jsqr";

type ScanStatus = "idle" | "ok" | "already_used" | "invalid" | "cancelled";

interface ScanResult {
  status: ScanStatus;
  message: string;
  ticket?: {
    id: string;
    holderName?: string;
    ticketName: string;
    tier?: string;
    checkedInAt?: string;
    entriesUsed?: number;
    entriesAllowed?: number;
    entriesLeft?: number;
  };
}

// Accent colour per scan outcome — green admit, amber repeat, red reject.
const ACCENT: Record<ScanStatus, string> = {
  idle:         "#ffffff",
  ok:           "#22c55e",
  already_used: "#f59e0b",
  invalid:      "#ef4444",
  cancelled:    "#ef4444",
};

function statusMeta(dict: Dictionary, status: ScanStatus): { icon: React.ReactNode; label: string } {
  switch (status) {
    case "ok":           return { icon: <CheckCircle2 className="h-6 w-6 text-white" />, label: dict["checkin.admitted"] };
    case "already_used": return { icon: <AlertCircle  className="h-6 w-6 text-white" />, label: dict["checkin.already_in"] };
    case "invalid":      return { icon: <XCircle      className="h-6 w-6 text-white" />, label: dict["checkin.invalid"] };
    case "cancelled":    return { icon: <XCircle      className="h-6 w-6 text-white" />, label: dict["checkin.cancelled"] };
    default:             return { icon: null, label: "" };
  }
}

const CORNER_CLASSES = [
  "top-0 left-0 border-t-[5px] border-l-[5px] rounded-tl-2xl",
  "top-0 right-0 border-t-[5px] border-r-[5px] rounded-tr-2xl",
  "bottom-0 left-0 border-b-[5px] border-l-[5px] rounded-bl-2xl",
  "bottom-0 right-0 border-b-[5px] border-r-[5px] rounded-br-2xl",
];

export function CheckinScanner({ dict }: { dict: Dictionary }) {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number>(0);
  const lastScannedRef = useRef<string>("");
  const cooldownRef    = useRef(false);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [torch, setTorch]                 = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualMode, setManualMode]       = useState(false);
  const [manualInput, setManualInput]     = useState("");
  const [result, setResult]               = useState<ScanResult | null>(null);
  const [popupVisible, setPopupVisible]   = useState(false);
  const [cameraError, setCameraError]     = useState<string | null>(null);

  // ─── Camera ────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const secure = typeof location !== "undefined" &&
        (location.protocol === "https:" || location.hostname === "localhost");
      setCameraError(dict["checkin.camera_unavail"]);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(!!caps.torch);
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : dict["checkin.camera_unavail"]);
    }
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!manualMode) startCamera(); else stopCamera();
    return stopCamera;
  }, [manualMode, startCamera, stopCamera]);

  // ─── Torch ─────────────────────────────────────────────────────
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch { toast.error("Torch not supported"); }
  };

  // ─── Show result + auto-dismiss ────────────────────────────────
  const showResult = useCallback((res: ScanResult) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setResult(res);
    setPopupVisible(true);
    timerRef.current = setTimeout(() => {
      setPopupVisible(false);
      // wait for fade-out before resetting
      setTimeout(() => {
        setResult(null);
        cooldownRef.current = false;
        lastScannedRef.current = "";
      }, 300);
    }, 3000);
  }, []);

  // ─── QR loop ───────────────────────────────────────────────────
  const processQR = useCallback((code: string) => {
    if (cooldownRef.current || code === lastScannedRef.current) return;
    lastScannedRef.current = code;
    cooldownRef.current = true;
    handleScan(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && !cooldownRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (qr?.data) processQR(qr.data);
      }
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(rafRef.current);
  }, [processQR, manualMode]);

  // ─── API call ──────────────────────────────────────────────────
  const handleScan = async (qrCode: string) => {
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode }),
      });
      const data = await res.json();
      let status: ScanStatus = "invalid";
      if      (data.status === "OK")           status = "ok";
      else if (data.status === "ALREADY_USED") status = "already_used";
      else if (data.status === "CANCELLED")    status = "cancelled";
      showResult({ status, message: data.message, ticket: data.ticket });
    } catch {
      toast.error(dict["checkin.network_err"]);
      cooldownRef.current = false;
      lastScannedRef.current = "";
    }
  };

  const status  = result?.status ?? "idle";
  const accent  = ACCENT[status];
  const meta    = statusMeta(dict, status);
  const isIdle  = status === "idle";

  return (
    <div className="flex-1 flex flex-col relative bg-black">

      {/* ── Camera view ────────────────────────────────────────── */}
      {!manualMode && (
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="text-center text-white/60 px-8">
              <ScanLine className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium mb-2">{dict["checkin.camera_unavail"]}</p>
              <p className="text-sm mb-4">{cameraError}</p>
              <Button variant="secondary" onClick={() => setManualMode(true)}>{dict["checkin.use_manual"]}</Button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />

              {/* ── The scan square ── */}
              <div className="relative z-10">
                <div
                  className={cn(
                    "w-64 h-64 sm:w-72 sm:h-72 rounded-2xl relative transition-all duration-200",
                    isIdle ? "border-2 border-transparent" : "border-[6px]",
                  )}
                  style={!isIdle ? { borderColor: accent, boxShadow: `0 0 0 4px ${accent}40` } : undefined}
                >
                  {/* Corner brackets — only in idle */}
                  {isIdle && CORNER_CLASSES.map((cls, i) => (
                    <div key={i} className={cn("absolute w-10 h-10 border-white", cls)} />
                  ))}

                  {/* Scanning line — only in idle */}
                  {isIdle && (
                    <div className="absolute inset-x-0 top-1/2 h-0.5 bg-white/40 animate-scan-line" />
                  )}
                </div>
              </div>

              {/* ── Bottom sheet — scanned ticket info, slides up from the bottom ── */}
              <div
                className={cn(
                  "absolute left-0 right-0 bottom-0 z-20 transition-transform duration-300 ease-out",
                  result && status !== "idle" && popupVisible ? "translate-y-0" : "translate-y-full",
                )}
              >
                <div className="rounded-t-3xl border-t border-white/10 bg-neutral-900/95 px-5 pt-3 pb-7 backdrop-blur-sm">
                  <div className="mx-auto mb-4 h-1.5 w-10 rounded-full" style={{ backgroundColor: accent }} />
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-black tracking-wide" style={{ color: accent }}>{meta.label}</p>
                      {result?.ticket ? (
                        <p className="truncate text-sm text-white">
                          <span className="font-semibold">{result.ticket.holderName ?? dict["checkin.guest"]}</span>
                          <span className="text-white/50"> · {result.ticket.ticketName}</span>
                        </p>
                      ) : result?.message ? (
                        <p className="truncate text-sm text-white/60">{result.message}</p>
                      ) : null}
                    </div>
                    {result?.ticket?.tier && (
                      <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/70">
                        {result.ticket.tier.replace("_", " ")}
                      </span>
                    )}
                  </div>

                  {/* Multi-entry slot usage */}
                  {status === "ok" && result?.ticket && (result.ticket.entriesAllowed ?? 1) > 1 && (
                    <div className="mt-3 flex items-center gap-1.5">
                      {Array.from({ length: result.ticket.entriesAllowed! }).map((_, i) => (
                        <div key={i} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i < (result.ticket!.entriesUsed ?? 0) ? accent : "rgba(255,255,255,0.2)" }} />
                      ))}
                      <span className="ml-1 text-xs text-white/50">{result.ticket.entriesLeft} left</span>
                    </div>
                  )}

                  {/* Already-used: when they last came in */}
                  {status === "already_used" && result?.ticket?.checkedInAt && (
                    <p className="mt-2 text-xs text-white/40">
                      Last entry {new Date(result.ticket.checkedInAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Manual entry ───────────────────────────────────────── */}
      {manualMode && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <p className="text-white/50 text-sm">{dict["checkin.manual_hint"]}</p>
          <div className="w-full max-w-sm flex gap-2">
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={dict["checkin.manual_ph"]}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualInput.trim()) {
                  handleScan(manualInput.trim());
                  setManualInput("");
                }
              }}
              autoFocus
            />
            <Button
              onClick={() => { if (manualInput.trim()) { handleScan(manualInput.trim()); setManualInput(""); } }}
              disabled={!manualInput.trim()}
            >
              {dict["checkin.check_btn"]}
            </Button>
          </div>

          {/* Result card in manual mode */}
          {result && result.status !== "idle" && (
            <div className={cn(
              "w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-white/5",
              "transition-all duration-300",
              popupVisible ? "opacity-100" : "opacity-0",
            )}>
              <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
                  {meta.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black tracking-wider" style={{ color: accent }}>{meta.label}</p>
                  {result.ticket ? (
                    <p className="mt-0.5 truncate text-xs text-white/70">
                      {result.ticket.holderName ?? dict["checkin.guest"]} · {result.ticket.ticketName}
                    </p>
                  ) : result.message ? (
                    <p className="mt-0.5 text-xs text-white/50">{result.message}</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="relative z-30 flex items-center justify-between px-6 py-4 border-t border-white/10 bg-black/80">
        <Button
          variant="ghost" size="icon"
          className="text-white hover:bg-white/10"
          onClick={() => setManualMode((m) => !m)}
          title={manualMode ? dict["checkin.pointing"] : dict["checkin.manual_mode"]}
        >
          {manualMode ? <RotateCcw className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
        </Button>

        <p className="text-xs text-white/30">
          {manualMode ? dict["checkin.manual_mode"] : dict["checkin.pointing"]}
        </p>

        <Button
          variant="ghost" size="icon"
          className={cn("hover:bg-white/10", torch ? "text-white" : "text-white/40", !torchSupported && "opacity-0 pointer-events-none")}
          onClick={toggleTorch}
        >
          {torch ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}
