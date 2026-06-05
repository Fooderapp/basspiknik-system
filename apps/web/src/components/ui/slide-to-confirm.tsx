"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { ChevronsRight, Check, Loader2 } from "lucide-react";

const THUMB = 52;
const PAD = 4;
const TRACK_H = THUMB + PAD * 2;

interface Props {
  label: string;
  confirmedLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** filled track + thumb color */
  color?: string;
  /** text/icon color on top of `color` */
  onColor?: string;
  className?: string;
}

/** Drag-to-confirm pill for the web — deliberate swipe for irreversible actions. */
export function SlideToConfirm({
  label,
  confirmedLabel = "Done",
  onConfirm,
  disabled = false,
  color = "#22c55e",
  onColor = "#000000",
  className,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [trackW, setTrackW] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const maxX = Math.max(0, trackW - THUMB - PAD * 2);

  useEffect(() => {
    const measure = () => setTrackW(trackRef.current?.offsetWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fillWidth = useTransform(x, (v) => v + THUMB + PAD * 2);
  const labelOpacity = useTransform(x, [0, Math.max(1, maxX * 0.55)], [1, 0]);

  const handleDragEnd = async (_: unknown, info: PanInfo) => {
    if (disabled || busy || done) return;
    if (x.get() > maxX * 0.85) {
      animate(x, maxX, { duration: 0.12 });
      setBusy(true);
      try {
        await onConfirm();
        setDone(true);
      } catch {
        animate(x, 0, { type: "spring", stiffness: 300, damping: 26 });
      } finally {
        setBusy(false);
      }
    } else {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 26 });
    }
  };

  return (
    <div
      ref={trackRef}
      className={`relative w-full select-none overflow-hidden rounded-full border ${className ?? ""}`}
      style={{ height: TRACK_H, background: "#18181b", borderColor: "#27272a", opacity: disabled ? 0.4 : 1 }}
    >
      {/* progress fill */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 rounded-full"
        style={{ width: fillWidth, background: color, opacity: 0.22 }}
      />

      {/* label */}
      {!done ? (
        <motion.div
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-semibold"
          style={{ color: "#fafafa", opacity: labelOpacity }}
        >
          {label}
        </motion.div>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold" style={{ color: onColor }}>
          {confirmedLabel}
        </div>
      )}

      {/* thumb */}
      <motion.div
        drag={disabled || busy || done ? false : "x"}
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x, width: THUMB, height: THUMB, top: PAD, left: PAD, background: color }}
        className="absolute flex cursor-grab items-center justify-center rounded-full shadow-lg active:cursor-grabbing"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" color={onColor} />
        ) : done ? (
          <Check className="h-6 w-6" color={onColor} strokeWidth={2.5} />
        ) : (
          <ChevronsRight className="h-6 w-6" color={onColor} strokeWidth={2.5} />
        )}
      </motion.div>
    </div>
  );
}
