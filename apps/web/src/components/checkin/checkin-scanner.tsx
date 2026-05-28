"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Flashlight, FlashlightOff, ScanLine, Keyboard, RotateCcw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
    event?: string;
    checkedInAt?: string;
    entriesUsed?: number;
    entriesAllowed?: number;
    entriesLeft?: number;
  };
}

const STATUS_CONFIG: Record<ScanStatus, { bg: string; icon: React.ReactNode; label: string }> = {
  idle:         { bg: "bg-black",          icon: <ScanLine className="h-12 w-12" />,      label: "" },
  ok:           { bg: "bg-green-600",      icon: <CheckCircle2 className="h-16 w-16" />,  label: "ADMITTED" },
  already_used: { bg: "bg-amber-500",      icon: <AlertCircle className="h-16 w-16" />,   label: "ALREADY IN" },
  invalid:      { bg: "bg-red-600",        icon: <XCircle className="h-16 w-16" />,       label: "INVALID" },
  cancelled:    { bg: "bg-red-800",        icon: <XCircle className="h-16 w-16" />,       label: "CANCELLED" },
};

export function CheckinScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastScannedRef = useRef<string>("");
  const cooldownRef = useRef(false);

  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [flashClass, setFlashClass] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ─── Camera init ───────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    // iOS Safari and other browsers require HTTPS (secure context) for camera access.
    // navigator.mediaDevices is undefined on HTTP — guard before calling anything.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const isSecure = typeof location !== "undefined" &&
        (location.protocol === "https:" || location.hostname === "localhost");
      setCameraError(
        isSecure
          ? "Camera not available on this browser. Use manual entry."
          : "Camera requires HTTPS. Open this page over HTTPS or use manual entry."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check torch support
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(!!caps.torch);

      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Camera unavailable");
    }
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!manualMode) startCamera();
    else stopCamera();
    return stopCamera;
  }, [manualMode, startCamera, stopCamera]);

  // ─── Torch toggle ──────────────────────────────────────────────
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      toast.error("Torch not supported on this device");
    }
  };

  // ─── QR scanning loop ──────────────────────────────────────────
  const processQR = useCallback((code: string) => {
    if (cooldownRef.current || code === lastScannedRef.current) return;
    lastScannedRef.current = code;
    cooldownRef.current = true;
    handleScan(code);
    setTimeout(() => {
      cooldownRef.current = false;
      lastScannedRef.current = "";
    }, 3000);
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
        const qr = jsQR(imageData.data, canvas.width, canvas.height, {
          inversionAttempts: "dontInvert",
        });
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
      if (data.status === "OK") status = "ok";
      else if (data.status === "ALREADY_USED") status = "already_used";
      else if (data.status === "CANCELLED") status = "cancelled";

      setResult({ status, message: data.message, ticket: data.ticket });

      // Flash animation
      const flashMap: Record<ScanStatus, string> = {
        ok:           "animate-flash-green",
        already_used: "animate-flash-amber",
        invalid:      "animate-flash-red",
        cancelled:    "animate-flash-red",
        idle:         "",
      };
      setFlashClass(flashMap[status]);
      setTimeout(() => { setFlashClass(""); setResult(null); }, 3000);
    } catch {
      toast.error("Network error — check connection");
    }
  };

  const cfg = STATUS_CONFIG[result?.status ?? "idle"];

  return (
    <div className={cn("flex-1 flex flex-col relative transition-colors duration-300", result ? cfg.bg : "bg-black")}>

      {/* Flash overlay */}
      {flashClass && (
        <div className={cn("absolute inset-0 z-10 pointer-events-none opacity-0", flashClass)} />
      )}

      {/* Result overlay */}
      {result && result.status !== "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white text-center p-6 gap-4">
          {cfg.icon}
          <p className="text-3xl font-black tracking-wider">{cfg.label}</p>
          {result.ticket && (
            <div className="space-y-1 text-center">
              <p className="text-xl font-bold">{result.ticket.holderName ?? "Guest"}</p>
              <p className="text-white/80">{result.ticket.ticketName}</p>
              {result.ticket.tier && (
                <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-sm">
                  {result.ticket.tier}
                </span>
              )}
              {/* Multi-entry dot indicator */}
              {result.status === "ok" && (result.ticket.entriesAllowed ?? 1) > 1 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  {Array.from({ length: result.ticket.entriesAllowed! }).map((_, i) => (
                    <div key={i} className={`h-3 w-3 rounded-full ${i < (result.ticket!.entriesUsed ?? 0) ? "bg-white" : "bg-white/30"}`} />
                  ))}
                  <span className="text-sm text-white/80 ml-1">{result.ticket.entriesLeft} left</span>
                </div>
              )}
              {result.status === "already_used" && result.ticket.checkedInAt && (
                <p className="text-sm text-white/60 mt-2">
                  Last entry at {new Date(result.ticket.checkedInAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
          {result.status === "invalid" && (
            <p className="text-white/70 text-sm">{result.message}</p>
          )}
        </div>
      )}

      {/* Camera view */}
      {!manualMode && (
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="text-center text-white/60 px-8">
              <ScanLine className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium mb-2">Camera unavailable</p>
              <p className="text-sm mb-4">{cameraError}</p>
              <Button variant="secondary" onClick={() => setManualMode(true)}>
                Use Manual Entry
              </Button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scan frame overlay */}
              {!result && (
                <div className="relative z-10 w-64 h-64 sm:w-80 sm:h-80">
                  <div className="absolute inset-0 rounded-2xl border-2 border-white/30" />
                  {/* Corners */}
                  {[
                    "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                  ].map((cls, i) => (
                    <div key={i} className={cn("absolute w-8 h-8 border-white", cls)} />
                  ))}
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-white/40 animate-scan-line" />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Manual entry mode */}
      {manualMode && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <p className="text-white/60 text-sm">Enter QR code manually</p>
          <div className="w-full max-w-sm flex gap-2">
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="TKT-XXXXXXXX-…"
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
              Check
            </Button>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="relative z-30 flex items-center justify-between px-6 py-4 border-t border-white/10 bg-black/80">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={() => setManualMode((m) => !m)}
          title={manualMode ? "Camera mode" : "Manual entry"}
        >
          {manualMode ? <RotateCcw className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
        </Button>

        <div className="text-center">
          <p className="text-xs text-white/40">
            {manualMode ? "Manual Entry" : result ? "" : "Point at QR code"}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn("hover:bg-white/10", torch ? "text-yellow-400" : "text-white/40", !torchSupported && "opacity-0 pointer-events-none")}
          onClick={toggleTorch}
          title="Toggle torch"
        >
          {torch ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}
