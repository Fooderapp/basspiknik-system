"use client";

import { useState } from "react";
import { ArrowRightLeft, UserCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Dictionary } from "@/lib/i18n";

interface Props {
  ticketId: string;
  ticketName: string;
  dict: Dictionary;
}

interface Recipient {
  id: string;
  name: string;
  displayId: string;
}

export function TransferTicketButton({ ticketId, ticketName, dict }: Props) {
  const [open, setOpen]             = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [recipient, setRecipient]   = useState<Recipient | null>(null);
  const [resolving, setResolving]   = useState(false);
  const [transferring, setTransferring] = useState(false);

  function reset() {
    setIdentifier("");
    setRecipient(null);
  }

  async function resolve() {
    if (!identifier.trim() || resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/tickets/lookup-user?identifier=${encodeURIComponent(identifier.trim())}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "User not found"); return; }
      setRecipient(data);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setResolving(false);
    }
  }

  async function confirm() {
    if (!recipient || transferring) return;
    setTransferring(true);
    try {
      const res = await fetch("/api/tickets/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, identifier: recipient.displayId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Transfer failed"); return; }
      toast.success(`${dict["transfer.success"]} ${data.recipientName}`);
      setOpen(false);
      reset();
      window.location.reload();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setTransferring(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => { reset(); setOpen(true); }}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        {dict["transfer.button"]}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dict["transfer.title"]}</DialogTitle>
            <DialogDescription>
              {dict["transfer.description"].replace("this ticket", `"${ticketName}"`)}
            </DialogDescription>
          </DialogHeader>

          {!recipient ? (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>{dict["transfer.bass_id_label"]}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={dict["transfer.bass_id_ph"]}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && resolve()}
                    autoFocus
                  />
                  <Button onClick={resolve} disabled={resolving || identifier.trim().length < 4}>
                    {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : dict["transfer.find"]}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{dict["transfer.bass_id_hint"]}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{recipient.name}</p>
                  <p className="text-xs text-muted-foreground">{recipient.displayId}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
                  {dict["transfer.change"]}
                </Button>
              </div>
              <p className="text-xs text-destructive/80">{dict["transfer.warning"]}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>
              {dict["transfer.cancel"]}
            </Button>
            {recipient && (
              <Button variant="destructive" onClick={confirm} disabled={transferring}>
                {transferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {dict["transfer.confirm"]}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
