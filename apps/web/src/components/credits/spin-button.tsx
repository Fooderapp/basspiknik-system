"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Coins, Sparkles, Dices, Star, Info } from "lucide-react";
import { Dice3D } from "@/components/three/Dice3D";
import type { Dictionary } from "@/lib/i18n";

interface SpinButtonProps {
  context: "TICKET" | "DRINK";
  eventId?: string;
  items?: { ticketTypeId: string; quantity: number }[];
  dict: Dictionary;
  /** Called with a single-use token when the user wins. */
  onWin: (token: string) => void;
  /** Disable when there is nothing in the cart. */
  disabled?: boolean;
}

type Phase = "idle" | "spinning" | "win" | "lose";

const WIN_FACE = 6; // double six = jackpot
const d6 = () => 1 + Math.floor(Math.random() * 6);
function loseFaces(): [number, number] {
  let a = d6();
  let b = d6();
  while (a === WIN_FACE && b === WIN_FACE) b = d6();
  return [a, b];
}

export function SpinButton({ context, eventId, items = [], dict, onWin, disabled }: SpinButtonProps) {
  const [balance, setBalance] = useState(0);
  const [spinCost, setSpinCost] = useState(4);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [faces, setFaces] = useState<[number, number]>([WIN_FACE, WIN_FACE]);

  const loadBalance = () => {
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => {
        setBalance(d.balance ?? 0);
        setSpinCost(d.spinCost ?? 4);
        setEnabled(!!d.enabled);
      })
      .catch(() => {});
  };

  useEffect(loadBalance, []);

  // Cycle faces rapidly while the dice tumble
  useEffect(() => {
    if (phase !== "spinning") return;
    const iv = setInterval(() => setFaces([d6(), d6()]), 90);
    return () => clearInterval(iv);
  }, [phase]);

  // Show the banner whenever the credit feature is enabled (logged-in user).
  // When the balance is short, it renders disabled with a "need credits" hint
  // rather than disappearing — keeps the Lucky Roll discoverable.
  if (!enabled) return null;

  const canSpin = balance >= spinCost && !disabled;

  const doSpin = async () => {
    if (!canSpin) { toast.error(dict["credits.not_enough"]); return; }
    setOpen(true);
    setPhase("spinning");
    try {
      const res = await fetch("/api/credits/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, eventId, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOpen(false);
        setPhase("idle");
        toast.error(data.error ?? dict["credits.not_eligible"]);
        return;
      }
      // brief suspense so the reel is visible
      await new Promise((r) => setTimeout(r, 700));
      setBalance(data.balance ?? balance);
      if (data.win && data.token) {
        setFaces([WIN_FACE, WIN_FACE]);
        setPhase("win");
        onWin(data.token);
      } else {
        setFaces(loseFaces());
        setPhase("lose");
      }
    } catch {
      setOpen(false);
      setPhase("idle");
      toast.error(dict["credits.not_eligible"]);
    }
  };

  return (
    <>
      {/* Free-spin banner — black based, light content */}
      <button
        type="button"
        onClick={doSpin}
        disabled={!canSpin}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 transition-opacity active:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: "#16170F" }}
      >
        <span className="flex items-center gap-2 text-left">
          <Sparkles className="h-4 w-4 shrink-0" style={{ color: "#FBBF24" }} strokeWidth={2.25} />
          <span className="text-sm font-bold text-white">
            {!canSpin
              ? `${dict["credits.need"]} ${spinCost} ${dict["credits.balance"]}`
              : context === "DRINK"
              ? dict["credits.roll_cta_drink"]
              : dict["credits.roll_cta"]}
          </span>
          <span className="hidden text-xs text-white/50 sm:inline">
            {dict["credits.costs"]} {spinCost} {dict["credits.balance"]}
          </span>
        </span>
        <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
          <Coins className="h-3 w-3" style={{ color: "#FBBF24" }} />
          <span className="text-xs font-bold text-white">{balance}</span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setPhase("idle"); } }}>
        <DialogContent className="sm:max-w-sm bg-background p-0 overflow-hidden">
          {/* Header — amber dice chip + title, like mobile */}
          <DialogHeader className="px-5 pt-5 pb-1">
            <DialogTitle className="flex items-center gap-2 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: "#f59e0b" }}>
                <Dices className="h-[18px] w-[18px] text-black" strokeWidth={2.25} />
              </span>
              <span className="text-xl font-bold tracking-tight">{dict["credits.lucky_roll"]}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">{dict["credits.double_six"]}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center px-5 pb-6">
            {/* Marquee */}
            <div className="mb-5 flex items-center gap-2">
              <Star className="h-3.5 w-3.5" style={{ color: "#fbbf24" }} fill="#fbbf24" strokeWidth={2} />
              <span className="text-[11px] font-bold tracking-[3px] text-amber-400">{dict["credits.double_six"]}</span>
              <Star className="h-3.5 w-3.5" style={{ color: "#fbbf24" }} fill="#fbbf24" strokeWidth={2} />
            </div>

            {/* Dice tray — glows amber on win */}
            <div
              className={`relative rounded-[28px] border-2 px-5 py-4 transition-all ${phase === "win" ? "animate-pulse" : ""}`}
              style={{
                backgroundColor: "#0c0c0f",
                borderColor: phase === "win" ? "rgba(245,158,11,1)" : "rgba(245,158,11,0.18)",
                boxShadow: phase === "win" ? "0 0 26px rgba(245,158,11,0.7)" : "none",
                width: 252,
                maxWidth: "100%",
              }}
            >
              <Dice3D rolling={phase === "spinning"} faces={faces} win={phase === "win"} height={150} />
            </div>

            {/* Phase message */}
            <div className="mt-3 flex h-7 items-center text-center">
              {phase === "win" && <span className="text-base font-bold text-amber-400">{dict["credits.win_msg"]}</span>}
              {phase === "lose" && <span className="text-base font-bold text-muted-foreground">{dict["credits.lose_msg"]}</span>}
              {phase === "spinning" && <span className="text-sm text-muted-foreground">{dict["credits.spinning"]}</span>}
              {phase === "idle" && <span className="text-sm text-muted-foreground">{dict["credits.tap_roll"]}</span>}
            </div>

            {/* Balance */}
            <div className="mt-1 flex items-center gap-1.5">
              <Star className="h-3 w-3" style={{ color: "#fbbf24" }} fill="#fbbf24" strokeWidth={2} />
              <span className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{balance}</span> {dict["credits.balance"]} · {spinCost} {dict["credits.per_roll"]}
              </span>
            </div>

            {/* Actions */}
            <div className="mt-5 flex w-full flex-col gap-3">
              {(phase === "idle" || phase === "spinning") && (
                <button
                  onClick={doSpin}
                  disabled={!canSpin}
                  className={`flex h-[58px] items-center justify-center gap-2 rounded-2xl text-base font-bold transition active:opacity-90 ${
                    canSpin ? "bg-[#f59e0b] text-black" : "bg-[#27272a] text-muted-foreground"
                  } ${canSpin && phase === "idle" ? "animate-pulse" : ""}`}
                >
                  <Dices className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  {phase === "spinning"
                    ? dict["credits.spinning"]
                    : canSpin
                    ? `${dict["credits.roll"]} · ${spinCost} ${dict["credits.balance"]}`
                    : `${dict["credits.need"]} ${spinCost} ${dict["credits.balance"]}`}
                </button>
              )}

              {phase === "win" && (
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-[58px] items-center justify-center rounded-2xl bg-[#f59e0b] text-base font-bold text-black active:opacity-90"
                >
                  🎟 {context === "DRINK" ? dict["credits.claim_free_drink"] : dict["credits.claim_free"]}
                </button>
              )}

              {phase === "lose" && (
                <button
                  onClick={doSpin}
                  disabled={balance < spinCost}
                  className="h-14 rounded-2xl bg-secondary text-base font-semibold text-foreground transition active:opacity-80 disabled:opacity-50"
                >
                  {balance >= spinCost
                    ? `${dict["credits.spin_again"]} · ${spinCost} ${dict["credits.balance"]}`
                    : dict["credits.not_enough"]}
                </button>
              )}

              <button onClick={() => setOpen(false)} className="py-1.5 text-sm text-muted-foreground active:opacity-60">
                {phase === "win" ? dict["credits.skip_pay"] : dict["credits.close"]}
              </button>

              <div className="flex items-start gap-2 px-1">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.75} />
                <span className="text-xs text-muted-foreground/70">{dict["credits.info_hint"]}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
