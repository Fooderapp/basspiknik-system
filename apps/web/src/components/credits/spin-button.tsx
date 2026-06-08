"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Coins, Sparkles } from "lucide-react";
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

  // Mirror mobile: the lucky-roll banner only appears when credits are enabled
  // AND the user can actually afford a spin.
  if (!enabled || balance < spinCost) return null;

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
      {/* Amber lucky-roll banner — matches mobile buy footer */}
      <button
        type="button"
        onClick={doSpin}
        disabled={!canSpin}
        className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 transition-opacity active:opacity-75 disabled:opacity-50"
        style={{ borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)" }}
      >
        <span className="flex items-center gap-2 text-left">
          <Sparkles className="h-4 w-4 shrink-0" style={{ color: "#f59e0b" }} strokeWidth={2} />
          <span className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
            {context === "DRINK" ? dict["credits.roll_cta_drink"] : dict["credits.roll_cta"]}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {dict["credits.costs"]} {spinCost} {dict["credits.balance"]}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3" style={{ color: "#f59e0b" }} />
          <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>{balance}</span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setPhase("idle"); } }}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">
              {phase === "win" ? dict["credits.win_title"]
                : phase === "lose" ? dict["credits.lose_title"]
                : dict["credits.spin"]}
            </DialogTitle>
            <DialogDescription className="text-center">
              {phase === "win" ? dict["credits.win_body"]
                : phase === "lose" ? dict["credits.lose_body"]
                : dict["credits.spinning"]}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Dice3D rolling={phase === "spinning"} faces={faces} win={phase === "win"} height={160} />
          </div>

          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <Coins className="h-4 w-4" /> {balance} {dict["credits.balance"]}
          </div>

          {phase === "win" && (
            <Button className="w-full mt-2" onClick={() => setOpen(false)}>
              {context === "DRINK" ? dict["credits.claim_free_drink"] : dict["credits.claim_free"]}
            </Button>
          )}
          {phase === "lose" && (
            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                {dict["credits.close"]}
              </Button>
              <Button className="flex-1" disabled={balance < spinCost} onClick={doSpin}>
                {dict["credits.spin_again"]}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
