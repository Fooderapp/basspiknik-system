"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ScanLine, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Minus, Plus, Trash2, Wine, ChevronLeft, Keyboard, Flashlight, FlashlightOff, RotateCcw,
  Star, MessageSquare
} from "lucide-react";
import jsQR from "jsqr";
import type { Dictionary } from "@/lib/i18n";
import type { Currency } from "@/lib/settings";
import type { DrinkOrderStatus } from "@/lib/supabase/types";

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface DrinkOrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  fulfilled_at: string | null;
  drinks: { name: string; category: string } | null;
}
interface DrinkOrder {
  id: string;
  guest_name: string | null;
  notes: string | null;
  status: DrinkOrderStatus;
  is_vip: boolean;
  total: number;
  qr_token: string;
  created_at: string;
  drink_order_items: DrinkOrderItem[];
}

type ScanState = "idle" | "loading" | "found" | "in_progress_warn" | "not_found" | "done" | "cancelled";

interface Props {
  initialOrders: DrinkOrder[];
  dict: Dictionary;
  currency: Currency;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export function BartenderApp({ initialOrders, dict, currency }: Props) {
  const t  = (k: keyof typeof dict) => dict[k] ?? k;
  const fmt = (n: number) => formatCurrency(n, currency);

  /* Queue */
  const [orders, setOrders]           = useState<DrinkOrder[]>(initialOrders);
  const [activeOrder, setActiveOrder]   = useState<DrinkOrder | null>(null);
  const [scanState, setScanState]     = useState<ScanState>("idle");
  const [, setTick]                   = useState(0);
  // Track which order IDs this device opened — prevents cross-device takeover
  const myOrderIds                    = useRef<Set<string>>(new Set());
  // Alert popup state
  const [alert, setAlert]             = useState<{ title: string; body: string } | null>(null);

  /* Camera */
  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number>(0);
  const cooldownRef    = useRef(false);
  const lastTokenRef   = useRef("");
  const [torch, setTorch]           = useState(false);
  const [torchOk, setTorchOk]       = useState(false);
  const [camErr, setCamErr]         = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");

  /* Per-item optimistic fulfilled state: itemId → fulfilled boolean */
  const [fulfilled, setFulfilled] = useState<Record<string, boolean>>({});

  /* Tick for time labels */
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Realtime ──────────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("bar_app_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "drink_orders" }, async (payload) => {
        if (payload.eventType === "INSERT") {
          const res = await fetch(`/api/bar/orders/${(payload.new as DrinkOrder).id}`);
          if (res.ok) {
            const o: DrinkOrder = await res.json();
            setOrders(prev => prev.some(x => x.id === o.id) ? prev : [o, ...prev]);
            if (o.is_vip) toast.success(`${t("bar.vip_order")} — ${o.guest_name ?? t("bar.guest")}`);
          }
        } else if (payload.eventType === "UPDATE") {
          const upd = payload.new as DrinkOrder;
          setOrders(prev => prev.map(o => o.id === upd.id ? { ...o, status: upd.status } : o));
          if (activeOrder?.id === upd.id) setActiveOrder(prev => prev ? { ...prev, status: upd.status } : prev);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeOrder?.id]);

  /* ── Camera ────────────────────────────────────────────────────── */
  const startCam = useCallback(async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      const secure = location.protocol === "https:" || location.hostname === "localhost";
      setCamErr(secure ? t("bar.cam_unavail") : t("bar.cam_https"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const caps = stream.getVideoTracks()[0].getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      setTorchOk(!!caps.torch);
      setCamErr(null);
    } catch (e) {
      setCamErr(e instanceof Error ? e.message : t("bar.cam_unavail"));
    }
  }, []);

  const stopCam = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const isDetailOpen = !!activeOrder;

  useEffect(() => {
    if (!manualMode && !isDetailOpen) startCam();
    else stopCam();
    return stopCam;
  }, [manualMode, isDetailOpen, startCam, stopCam]);

  /* ── QR scan loop ──────────────────────────────────────────────── */
  const processToken = useCallback((token: string) => {
    if (cooldownRef.current || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    cooldownRef.current = true;
    handleScan(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDetailOpen || manualMode) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const loop = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && !cooldownRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0);
        const qr = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (qr?.data) processToken(qr.data);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isDetailOpen, manualMode, processToken]);

  /* ── Torch ─────────────────────────────────────────────────────── */
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(t => !t);
    } catch { toast.error(t("bar.torch_err")); }
  };

  /* ── Scan handler ──────────────────────────────────────────────── */
  const handleScan = async (token: string) => {
    setScanState("loading");
    try {
      const res = await fetch(`/api/bar/orders?token=${encodeURIComponent(token)}`);
      if (!res.ok) { setScanState("not_found"); reset(2000); return; }
      const order: DrinkOrder = await res.json();

      // Already done — alert popup, stay on scanner
      if (order.status === "FULFILLED") {
        setAlert({ title: t("bar.fulfilled_title"), body: `${order.guest_name ?? t("bar.guest")} — ${t("bar.fulfilled_body")}` });
        setScanState("idle"); reset(0); return;
      }
      if (order.status === "CANCELLED") {
        setAlert({ title: t("bar.cancelled_title"), body: t("bar.cancelled_body") });
        setScanState("idle"); reset(0); return;
      }

      if (order.status === "IN_PROGRESS") {
        // This device opened it previously — safe to resume
        if (myOrderIds.current.has(order.id)) {
          setActiveOrder(order);
          setScanState("found");
          initFulfilled(order);
          return;
        }
        // Different device is processing it — alert, block
        setAlert({
          title: t("bar.in_progress_title"),
          body: t("bar.in_progress_body"),
        });
        setScanState("idle"); reset(0); return;
      }

      // PENDING → this device takes ownership
      const patchRes = await fetch(`/api/bar/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      const updated: DrinkOrder = await patchRes.json();
      myOrderIds.current.add(updated.id);
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, status: "IN_PROGRESS" } : o));
      setActiveOrder(updated);
      setScanState("found");
      initFulfilled(updated);
    } catch {
      toast.error(t("bar.network_err"));
      setScanState("idle");
      cooldownRef.current = false;
      lastTokenRef.current = "";
    }
  };

  function initFulfilled(order: DrinkOrder) {
    const init: Record<string, boolean> = {};
    order.drink_order_items.forEach(i => { init[i.id] = !!i.fulfilled_at; });
    setFulfilled(init);
  }

  function reset(ms = 0) {
    setTimeout(() => {
      setScanState("idle");
      cooldownRef.current = false;
      lastTokenRef.current = "";
    }, ms);
  }

  /* ── Queue refresh ─────────────────────────────────────────────── */
  const refreshQueue = async () => {
    const res = await fetch("/api/bar/orders?status=PENDING,IN_PROGRESS");
    if (res.ok) setOrders(await res.json());
  };

  /* ── Item toggle (optimistic + API) ───────────────────────────── */
  const toggleItem = async (itemId: string) => {
    const next = !fulfilled[itemId];
    setFulfilled(prev => ({ ...prev, [itemId]: next }));
    if (!activeOrder) return;
    await fetch(`/api/bar/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: itemId, fulfilled: next }] }),
    });
  };

  /* ── Adjust quantity (optimistic) ──────────────────────────────── */
  const adjustQty = async (itemId: string, delta: number) => {
    if (!activeOrder) return;
    const item = activeOrder.drink_order_items.find(i => i.id === itemId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      // Remove item
      setActiveOrder(prev => prev ? {
        ...prev,
        drink_order_items: prev.drink_order_items.filter(i => i.id !== itemId),
      } : prev);
      await fetch(`/api/bar/orders/${activeOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: itemId, quantity: 0 }] }),
      });
    } else {
      setActiveOrder(prev => prev ? {
        ...prev,
        drink_order_items: prev.drink_order_items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i),
      } : prev);
      await fetch(`/api/bar/orders/${activeOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: itemId, quantity: newQty }] }),
      });
    }
  };

  /* ── Complete order ─────────────────────────────────────────────── */
  const [completing, setCompleting] = useState(false);
  const allDone = activeOrder
    ? activeOrder.drink_order_items.every(i => fulfilled[i.id])
    : false;

  const completeOrder = async () => {
    if (!activeOrder) return;
    setCompleting(true);
    try {
      await fetch(`/api/bar/orders/${activeOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FULFILLED" }),
      });
      setOrders(prev => prev.filter(o => o.id !== activeOrder.id));
      toast.success(`${t("bar.fulfilled_toast")} — ${activeOrder.guest_name ?? t("bar.guest")}`);
      closeOrder();
    } catch {
      toast.error(t("bar.fulfill_failed"));
    } finally {
      setCompleting(false);
    }
  };

  /* ── Cancel order (staff) ──────────────────────────────────────── */
  const cancelOrder = async () => {
    if (!activeOrder) return;
    await fetch(`/api/bar/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    setOrders(prev => prev.filter(o => o.id !== activeOrder.id));
    closeOrder();
  };

  function closeOrder() {
    setActiveOrder(null);
    setScanState("idle");
    setFulfilled({});
    cooldownRef.current = false;
    lastTokenRef.current = "";
  }

  /* ── Load order from queue tap ──────────────────────────────────── */
  const loadOrder = async (order: DrinkOrder) => {
    if (order.status === "IN_PROGRESS" && !myOrderIds.current.has(order.id)) {
      setAlert({
        title: t("bar.in_progress_title"),
        body: t("bar.in_progress_body2"),
      });
      return;
    }
    if (order.status === "PENDING") {
      const res = await fetch(`/api/bar/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      const updated: DrinkOrder = await res.json();
      myOrderIds.current.add(updated.id);
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, status: "IN_PROGRESS" } : o));
      setActiveOrder(updated);
      setScanState("found");
      initFulfilled(updated);
    } else {
      setActiveOrder(order);
      setScanState("found");
      initFulfilled(order);
    }
  };

  const pending    = orders.filter(o => o.status === "PENDING");
  const inProgress = orders.filter(o => o.status === "IN_PROGRESS");

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <>
    {/* ── Alert popup (blocked scans) ──────────────────────────────── */}
    <AlertDialog open={!!alert} onOpenChange={(open) => { if (!open) { setAlert(null); cooldownRef.current = false; lastTokenRef.current = ""; } }}>
      <AlertDialogContent className="bg-card border-border max-w-xs">
        <AlertDialogHeader>
          <AlertDialogTitle>{alert?.title}</AlertDialogTitle>
          <AlertDialogDescription>{alert?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => { setAlert(null); cooldownRef.current = false; lastTokenRef.current = ""; }}>
            {t("bar.alert_ok")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="flex h-screen bg-black text-white overflow-hidden">

      {/* ═══ LEFT: Queue strip ═══════════════════════════════════════ */}
      <aside className="w-24 sm:w-36 flex-shrink-0 border-r border-white/10 flex flex-col overflow-hidden">
        <div className="px-2 py-3 border-b border-white/10 flex items-center justify-center">
          <Wine className="h-4 w-4 text-white/40" />
        </div>

        {/* Pending */}
        {pending.length > 0 && (
          <div className="px-1.5 pt-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/60 px-1 mb-1">
              {pending.length} {t("bar.new_label")}
            </p>
            {pending.map(o => (
              <QueueCard key={o.id} order={o} active={activeOrder?.id === o.id} onClick={() => loadOrder(o)} fmt={fmt} guestLabel={t("bar.guest")} />
            ))}
          </div>
        )}

        {/* In Progress */}
        {inProgress.length > 0 && (
          <div className="px-1.5 pt-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40 px-1 mb-1">
              {inProgress.length} {t("bar.active_label")}
            </p>
            {inProgress.map(o => (
              <QueueCard key={o.id} order={o} active={activeOrder?.id === o.id} onClick={() => loadOrder(o)} fmt={fmt} guestLabel={t("bar.guest")} />
            ))}
          </div>
        )}

        {pending.length === 0 && inProgress.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[9px] text-white/20 text-center px-1">{t("bar.no_orders_queue")}</p>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={refreshQueue}
          className="mt-auto py-3 text-white/20 hover:text-white/60 flex items-center justify-center transition-colors"
          title="Refresh queue"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </aside>

      {/* ═══ RIGHT: Scanner or Order Detail ═════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── No order: scanner view ── */}
        {!activeOrder && (
          <ScannerView
            scanState={scanState}
            manualMode={manualMode}
            setManualMode={setManualMode}
            manualInput={manualInput}
            setManualInput={setManualInput}
            handleScan={handleScan}
            videoRef={videoRef}
            canvasRef={canvasRef}
            camErr={camErr}
            torch={torch}
            torchOk={torchOk}
            toggleTorch={toggleTorch}
            dict={dict}
          />
        )}

        {/* ── Order loaded: detail view ── */}
        {activeOrder && (
          <OrderDetail
            order={activeOrder}
            scanState={scanState}
            fulfilled={fulfilled}
            allDone={allDone}
            completing={completing}
            fmt={fmt}
            dict={dict}
            onToggleItem={toggleItem}
            onAdjustQty={adjustQty}
            onComplete={completeOrder}
            onCancel={cancelOrder}
            onBack={closeOrder}
          />
        )}
      </main>
    </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Queue Card (compact strip item)
═══════════════════════════════════════════════════════════════════════════════ */
function QueueCard({ order, active, onClick, fmt, guestLabel }: {
  order: DrinkOrder; active: boolean; onClick: () => void;
  fmt: (n: number) => string;
  guestLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg p-1.5 mb-1 transition-colors",
        active ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
        order.is_vip && "border border-white/40"
      )}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {order.is_vip && <Star className="h-2.5 w-2.5 fill-current text-white" />}
        <span className={cn(
          "h-1.5 w-1.5 rounded-full flex-shrink-0",
          order.status === "PENDING" ? "bg-white" : "bg-white/40"
        )} />
        <span className="text-[10px] font-mono text-white/50 truncate">{order.qr_token.slice(0, 6)}</span>
      </div>
      <p className="text-[11px] font-semibold truncate">{order.guest_name ?? guestLabel}</p>
      <p className="text-[9px] text-white/40">
        {order.drink_order_items.length}× · {fmt(order.total)}
      </p>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Scanner View
═══════════════════════════════════════════════════════════════════════════════ */
const SCAN_BG: Record<ScanState, string> = {
  idle:             "",
  loading:          "",
  found:            "border-white   shadow-[0_0_0_6px_rgba(255,255,255,0.2)]",
  in_progress_warn: "border-white/60 shadow-[0_0_0_6px_rgba(255,255,255,0.12)]",
  not_found:        "border-white/40 shadow-[0_0_0_6px_rgba(115,115,115,0.2)]",
  done:             "border-white   shadow-[0_0_0_6px_rgba(255,255,255,0.2)]",
  cancelled:        "border-white/40 shadow-[0_0_0_6px_rgba(115,115,115,0.2)]",
};

function buildScanLabel(dict: Dictionary): Record<ScanState, { text: string; color: string; Icon: typeof CheckCircle2 | null }> {
  return {
    idle:             { text: "",                          color: "",              Icon: null },
    loading:          { text: dict["bar.scan_looking"],    color: "text-white/60", Icon: null },
    found:            { text: dict["bar.scan_started"],    color: "text-white",    Icon: CheckCircle2 },
    in_progress_warn: { text: dict["bar.scan_in_progress"],color: "text-white/60", Icon: AlertTriangle },
    not_found:        { text: dict["bar.scan_not_found"],  color: "text-white/60", Icon: XCircle },
    done:             { text: dict["bar.scan_done"],       color: "text-white",    Icon: CheckCircle2 },
    cancelled:        { text: dict["bar.status_cancelled"],color: "text-white/60", Icon: XCircle },
  };
}

const CORNERS = [
  "top-0 left-0 border-t-[4px] border-l-[4px] rounded-tl-2xl",
  "top-0 right-0 border-t-[4px] border-r-[4px] rounded-tr-2xl",
  "bottom-0 left-0 border-b-[4px] border-l-[4px] rounded-bl-2xl",
  "bottom-0 right-0 border-b-[4px] border-r-[4px] rounded-br-2xl",
];

function ScannerView({
  scanState, manualMode, setManualMode, manualInput, setManualInput,
  handleScan, videoRef, canvasRef, camErr, torch, torchOk, toggleTorch, dict,
}: {
  scanState: ScanState;
  manualMode: boolean; setManualMode: (v: boolean) => void;
  manualInput: string; setManualInput: (v: string) => void;
  handleScan: (t: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  camErr: string | null;
  torch: boolean; torchOk: boolean; toggleTorch: () => void;
  dict: Dictionary;
}) {
  const isIdle = scanState === "idle";
  const label  = buildScanLabel(dict)[scanState];

  return (
    <div className="flex-1 flex flex-col relative">
      {!manualMode ? (
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {camErr ? (
            <div className="text-center text-white/50 px-8 space-y-3">
              <ScanLine className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm">{camErr}</p>
              <Button variant="secondary" size="sm" onClick={() => setManualMode(true)}>{dict["bar.cam_use_manual"]}</Button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <div className="relative z-10 flex flex-col items-center gap-6">
                {/* Scan frame */}
                <div className={cn(
                  "w-56 h-56 sm:w-72 sm:h-72 rounded-2xl relative transition-all duration-200",
                  isIdle ? "border-2 border-transparent" : cn("border-[8px]", SCAN_BG[scanState])
                )}>
                  {isIdle && CORNERS.map((c, i) => (
                    <div key={i} className={cn("absolute w-8 h-8 border-white/70", c)} />
                  ))}
                  {isIdle && (
                    <div className="absolute inset-x-0 top-1/2 h-px bg-white/30 animate-scan-line" />
                  )}
                  {scanState === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
                    </div>
                  )}
                </div>
                {label.text && (
                  <p className={cn("text-lg font-bold tracking-wide flex items-center gap-2", label.color)}>
                    {label.Icon && <label.Icon className="h-5 w-5" />}{label.text}
                  </p>
                )}
                {isIdle && (
                  <p className="text-xs text-white/30">{dict["bar.scan_hint"]}</p>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-white/40 text-sm">{dict["bar.manual_hint"]}</p>
          <div className="w-full max-w-xs flex gap-2">
            <input
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/40"
              placeholder={dict["bar.manual_ph"]}
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && manualInput.trim()) { handleScan(manualInput.trim()); setManualInput(""); }
              }}
              autoFocus
            />
            <Button size="sm" onClick={() => { if (manualInput.trim()) { handleScan(manualInput.trim()); setManualInput(""); } }}>
              {dict["bar.manual_go"]}
            </Button>
          </div>
          {label.text && (
            <p className={cn("text-base font-bold flex items-center gap-2", label.color)}>
              {label.Icon && <label.Icon className="h-4 w-4" />}{label.text}
            </p>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-black/60">
        <button
          onClick={() => setManualMode(!manualMode)}
          className="text-white/40 hover:text-white/80 transition-colors p-1"
          title={manualMode ? dict["bar.scan_mode_lbl"] : dict["bar.manual_mode_lbl"]}
        >
          {manualMode ? <RotateCcw className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
        </button>
        <p className="text-[10px] text-white/20">{manualMode ? dict["bar.manual_mode_lbl"] : dict["bar.scan_mode_lbl"]}</p>
        <button
          onClick={toggleTorch}
          className={cn(
            "p-1 transition-colors",
            !torchOk && "opacity-0 pointer-events-none",
            torch ? "text-white" : "text-white/30 hover:text-white/60"
          )}
        >
          {torch ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Order Detail Panel — full-height POS view
═══════════════════════════════════════════════════════════════════════════════ */
function OrderDetail({ order, scanState, fulfilled, allDone, completing, fmt, dict,
  onToggleItem, onAdjustQty, onComplete, onCancel, onBack }: {
  order: DrinkOrder;
  scanState: ScanState;
  fulfilled: Record<string, boolean>;
  allDone: boolean;
  completing: boolean;
  fmt: (n: number) => string;
  dict: Dictionary;
  onToggleItem: (id: string) => void;
  onAdjustQty: (id: string, d: number) => void;
  onComplete: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0",
        order.is_vip ? "bg-white/10 border-l-2 border-l-white" : "bg-white/5"
      )}>
        <button onClick={onBack} className="text-white/40 hover:text-white/80 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {order.is_vip && <Star className="h-4 w-4 fill-current text-white" />}
            <span className="font-bold text-lg truncate">{order.guest_name ?? dict["bar.guest"]}</span>
            <StatusBadge status={order.status} warn={scanState === "in_progress_warn"} dict={dict} />
          </div>
          <p className="text-[11px] text-white/30 font-mono">{order.qr_token.slice(0, 12)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-white/40">{order.drink_order_items.length} {dict["bar.items"]}</p>
          <p className="font-bold">{fmt(order.total)}</p>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-xs text-white/50 italic flex-shrink-0 flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 shrink-0" /> {order.notes}
        </div>
      )}

      {/* Items list — scrollable, large touch targets */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {order.drink_order_items.map(item => {
          const done = fulfilled[item.id] ?? false;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border transition-all duration-150 overflow-hidden",
                done
                  ? "bg-white/10 border-white/30"
                  : "bg-white/5 border-white/10"
              )}
            >
              {/* Tap row = toggle done */}
              <button
                className="w-full flex items-center gap-3 px-4 py-4 text-left"
                onClick={() => onToggleItem(item.id)}
              >
                {/* Checkbox */}
                <div className={cn(
                  "h-7 w-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  done ? "bg-white border-white" : "border-white/30"
                )}>
                  {done && <CheckCircle2 className="h-4 w-4 text-black" />}
                </div>

                {/* Name + notes */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "font-semibold text-base leading-tight",
                    done && "line-through text-white/40"
                  )}>
                    {item.drinks?.name ?? "?"}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-white/40 italic mt-0.5">{item.notes}</p>
                  )}
                </div>

                {/* Qty indicator */}
                <span className={cn("text-2xl font-bold tabular-nums mr-1", done ? "text-white/30" : "text-white")}>
                  ×{item.quantity}
                </span>
              </button>

              {/* Quantity controls */}
              <div className="flex items-center gap-2 px-4 pb-3 border-t border-white/5">
                <button
                  onClick={() => onAdjustQty(item.id, -1)}
                  className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-sm text-white/40 flex-1 text-center tabular-nums">{item.quantity}</span>
                <button
                  onClick={() => onAdjustQty(item.id, 1)}
                  className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onAdjustQty(item.id, -item.quantity)} // removes (qty → 0)
                  className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center transition-colors ml-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="flex-shrink-0 border-t border-white/10 p-3 flex gap-3 bg-black/60">
        <Button
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10 flex-shrink-0"
          onClick={onCancel}
        >
          <XCircle className="h-4 w-4 mr-1.5" />
          {dict["bar.cancel"]}
        </Button>
        <Button
          className={cn(
            "flex-1 h-14 text-lg font-bold transition-all",
            allDone
              ? "bg-white hover:bg-white/90 text-black"
              : "bg-white/10 text-white/30 cursor-not-allowed"
          )}
          disabled={!allDone || completing}
          onClick={completeOrder}
        >
          {completing
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : allDone
              ? <><CheckCircle2 className="h-5 w-5 mr-2" />{dict["bar.complete_order"]}</>
              : `${Object.values(fulfilled).filter(Boolean).length} / ${Object.keys(fulfilled).length} ${dict["bar.done_count"]}`
          }
        </Button>
      </div>
    </div>
  );

  // Inner helper needs to reference outer completing prop
  function completeOrder() { onComplete(); }
}

function StatusBadge({ status, warn, dict }: { status: DrinkOrderStatus; warn: boolean; dict: Dictionary }) {
  if (warn) return <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-bold">{dict["bar.status_in_progress"].toUpperCase()}</span>;
  const map: Record<DrinkOrderStatus, [string, keyof Dictionary]> = {
    PENDING:     ["bg-white/15 text-white",      "bar.status_pending"],
    IN_PROGRESS: ["bg-white/10 text-white/80",   "bar.status_in_progress"],
    FULFILLED:   ["bg-white text-black",         "bar.status_fulfilled"],
    CANCELLED:   ["bg-white/5 text-white/40",    "bar.status_cancelled"],
  };
  const [cls, key] = map[status];
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", cls)}>{dict[key].toUpperCase()}</span>;
}
