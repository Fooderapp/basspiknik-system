"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Coins, Sparkles } from "lucide-react";
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

const REEL = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "🍇", "💎"];

export function SpinButton({ context, eventId, items = [], dict, onWin, disabled }: SpinButtonProps) {
  const [balance, setBalance] = useState(0);
  const [spinCost, setSpinCost] = useState(4);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reel, setReel] = useState<string[]>([REEL[0], REEL[1], REEL[2]]);

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

  // Spin reel animation while the request is in flight
  useEffect(() => {
    if (phase !== "spinning") return;
    const iv = setInterval(() => {
      setReel([
        REEL[Math.floor(Math.random() * REEL.length)],
        REEL[Math.floor(Math.random() * REEL.length)],
        REEL[Math.floor(Math.random() * REEL.length)],
      ]);
    }, 90);
    return () => clearInterval(iv);
  }, [phase]);

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
        setReel(["7️⃣", "7️⃣", "7️⃣"]);
        setPhase("win");
        onWin(data.token);
      } else {
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
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 border-amber-400 text-amber-700 hover:bg-amber-50"
        onClick={doSpin}
        disabled={!canSpin}
      >
        <Sparkles className="h-4 w-4" />
        {dict["credits.spin"]} · {spinCost} {dict["credits.spin_cost"]}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Coins className="h-3 w-3" /> {balance}
        </span>
      </Button>

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

          <div className={`flex justify-center gap-3 py-6 text-5xl ${phase === "spinning" ? "animate-pulse" : ""}`}>
            {reel.map((s, i) => (
              <span key={i} className="w-16 h-20 flex items-center justify-center rounded-xl border bg-muted/40">
                {s}
              </span>
            ))}
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
