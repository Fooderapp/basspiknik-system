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
    checkedInAt?: string;
    entriesUsed?: number;
    entriesAllowed?: number;
    entriesLeft?: number;
  };
}

const BORDER_COLOR: Record<ScanStatus, string> = {
  idle:         "",
  ok:           "border-white    shadow-[0_0_0_4px_rgba(255,255,255,0.3)]",
  already_used: "border-white/60 shadow-[0_0_0_4px_rgba(255,255,255,0.15)]",
  invalid:      "border-white/40 shadow-[0_0_0_4px_rgba(115,115,115,0.3)]",
  cancelled:    "border-white/30 shadow-[0_0_0_4px_rgba(115,115,115,0.3)]",
};

const POPUP_CONFIG: Record<ScanStatus, { bar: string; icon: React.ReactNode; label: string; labelColor: string }> = {
  idle:         { bar: "",            icon: null,                                              label: "",           labelColor: "" },
  ok:           { bar: "bg-white",    icon: <CheckCircle2 className="h-5 w-5 text-white"/>,    label: "ADMITTED",   labelColor: "text-white" },
  already_used: { bar: "bg-white/60", icon: <AlertCircle  className="h-5 w-5 text-white/70"/>, label: "ALREADY IN", labelColor: "text-white/70" },
  invalid:      { bar: "bg-white/40", icon: <XCircle      className="h-5 w-5 text-white/60"/>, label: "INVALID",    labelColor: "text-white/60" },
  cancelled:    { bar: "bg-white/30", icon: <XCircle      className="h-5 w-5 text-white/60"/>, label: "CANCELLED",  labelColor: "text-white/60" },
};

const CORNER_CLASSES = [
  "top-0 left-0 border-t-[5px] border-l-[5px] rounded-tl-2xl",
  "top-0 right-0 border-t-[5px] border-r-[5px] rounded-tr-2xl",
  "bottom-0 left-0 border-b-[5px] border-l-[5px] rounded-bl-2xl",
  "bottom-0 right-0 border-b-[5px] border-r-[5px] rounded-br-2xl",
];

export function CheckinScanner() {
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
      setCameraError(secure
        ? "Camera not available on this browser. Use manual entry."
        : "Camera requires HTTPS. Use manual entry or open via HTTPS.");
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
      setCameraError(err instanceof Error ? err.message : "Camera unavailable");
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
      toast.error("Network error — check connection");
      cooldownRef.current = false;
      lastScannedRef.current = "";
    }
  };

  const status  = result?.status ?? "idle";
  const popup   = POPUP_CONFIG[status];
  const isIdle  = status === "idle";

  return (
    <div className="flex-1 flex flex-col relative bg-black">

      {/* ── Camera view ────────────────────────────────────────── */}
      {!manualMode && (
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="text-center text-white/60 px-8">
              <ScanLine className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium mb-2">Camera unavailable</p>
              <p className="text-sm mb-4">{cameraError}</p>
              <Button variant="secondary" onClick={() => setManualMode(true)}>Use Manual Entry</Button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />

              {/* ── Scan frame wrapper — popup floats above, frame never moves ── */}
              <div className="relative z-10">

                {/* Popup — absolutely above the scan square, no layout impact */}
                <div
                  className={cn(
                    "absolute bottom-full mb-3 left-0 right-0",
                    "rounded-xl overflow-hidden bg-black/85 backdrop-blur-sm border border-white/10",
                    "transition-all duration-300",
                    popupVisible && result
                      ? "opacity-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 translate-y-1 pointer-events-none",
                  )}
                >
                  {result && result.status !== "idle" && (
                    <>
                      <div className={cn("h-1 w-full", popup.bar)} />
                      <div className="px-4 py-3 flex items-start gap-3">
                        {popup.icon}
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-black tracking-wider", popup.labelColor)}>{popup.label}</p>
                          {result.ticket && (
                            <>
                              <p className="text-white text-sm font-semibold truncate mt-0.5">
                                {result.ticket.holderName ?? "Guest"}
                              </p>
                              <p className="text-white/60 text-xs truncate">{result.ticket.ticketName}</p>
                              {result.ticket.tier && (
                                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 uppercase tracking-wide">
                                  {result.ticket.tier.replace("_", " ")}
                                </span>
                              )}
                              {status === "ok" && (result.ticket.entriesAllowed ?? 1) > 1 && (
                                <div className="flex items-center gap-1.5 mt-2">
                                  {Array.from({ length: result.ticket.entriesAllowed! }).map((_, i) => (
                                    <div key={i} className={cn("h-2 w-2 rounded-full", i < (result.ticket!.entriesUsed ?? 0) ? "bg-white" : "bg-white/20")} />
                                  ))}
                                  <span className="text-[10px] text-white/50 ml-1">{result.ticket.entriesLeft} left</span>
                                </div>
                              )}
                              {status === "already_used" && result.ticket.checkedInAt && (
                                <p className="text-[10px] text-white/40 mt-1">
                                  Last entry {new Date(result.ticket.checkedInAt).toLocaleTimeString()}
                                </p>
                              )}
                            </>
                          )}
                          {status === "invalid" && (
                            <p className="text-white/50 text-xs mt-0.5">{result.message}</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ── The scan square itself ── */}
                <div
                  className={cn(
                    "w-64 h-64 sm:w-72 sm:h-72 rounded-2xl relative",
                    "transition-all duration-200",
                    // idle: transparent border (corners handle styling)
                    // result: thick solid colored border
                    isIdle
                      ? "border-2 border-transparent"
                      : cn("border-[10px]", BORDER_COLOR[status]),
                  )}
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
            </>
          )}
        </div>
      )}

      {/* ── Manual entry ───────────────────────────────────────── */}
      {manualMode && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <p className="text-white/50 text-sm">Enter ticket code manually</p>
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

          {/* Result popup in manual mode */}
          {result && result.status !== "idle" && (
            <div className={cn(
              "w-full max-w-sm rounded-xl overflow-hidden bg-white/5 border border-white/10",
              "transition-all duration-300",
              popupVisible ? "opacity-100" : "opacity-0",
            )}>
              <div className={cn("h-1 w-full", popup.bar)} />
              <div className="px-4 py-3 flex items-center gap-3">
                {popup.icon}
                <div>
                  <p className={cn("text-sm font-black tracking-wider", popup.labelColor)}>{popup.label}</p>
                  {result.ticket && (
                    <p className="text-white/70 text-xs mt-0.5">
                      {result.ticket.holderName ?? "Guest"} · {result.ticket.ticketName}
                    </p>
                  )}
                  {status === "invalid" && (
                    <p className="text-white/50 text-xs mt-0.5">{result.message}</p>
                  )}
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
          title={manualMode ? "Camera mode" : "Manual entry"}
        >
          {manualMode ? <RotateCcw className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
        </Button>

        <p className="text-xs text-white/30">
          {manualMode ? "Manual Entry" : "Point at QR code"}
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
