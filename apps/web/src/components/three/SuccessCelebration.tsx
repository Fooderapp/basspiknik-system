"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

// Canvas needs the DOM — never SSR it.
const CoinScene = dynamic(() => import("./CoinScene"), {
  ssr: false,
  loading: () => <div className="h-40 w-40" />,
});

const COLORS = ["#f4b51a", "#ffd76a", "#22c55e", "#fafafa", "#f59e0b"];

export function SuccessCelebration() {
  // Deterministic-ish confetti burst params computed once on mount.
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 360,
        y: 120 + Math.random() * 220,
        rot: Math.random() * 540,
        delay: Math.random() * 0.25,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [],
  );

  return (
    <div className="relative flex justify-center">
      {/* confetti */}
      <div className="pointer-events-none absolute inset-0 flex justify-center overflow-visible">
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 0, y: 0, x: 0, rotate: 0 }}
            animate={{ opacity: [0, 1, 1, 0], y: p.y, x: p.x, rotate: p.rot }}
            transition={{ duration: 1.6, delay: p.delay, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: 40,
              width: p.size,
              height: p.size * 1.6,
              borderRadius: 1,
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>

      {/* 3D coin */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
        className="h-40 w-40"
      >
        <CoinScene className="h-40 w-40" />
      </motion.div>
    </div>
  );
}
