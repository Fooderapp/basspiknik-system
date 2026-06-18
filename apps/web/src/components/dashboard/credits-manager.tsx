"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Search, Plus, Minus, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface GrantRow {
  id: string;
  amount: number;
  meta: { note?: string; granted_by?: string };
  created_at: string;
  profiles: { name: string; email: string } | null;
}

export function CreditsManager() {
  const [lookupType, setLookupType] = useState<"email" | "pass_id">("email");
  const [lookup, setLookup] = useState("");
  const [amount, setAmount] = useState<number>(10);
  const [note, setNote] = useState("");

  const [found, setFound] = useState<{ id: string; name: string; email: string; balance: number } | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [grants, setGrants] = useState<GrantRow[]>([]);

  const loadGrants = useCallback(async () => {
    const d = await (await fetch("/api/admin/credits")).json();
    setGrants(d.grants ?? []);
  }, []);

  useEffect(() => { void loadGrants(); }, [loadGrants]);

  // reset found user when lookup changes
  useEffect(() => { setFound(null); }, [lookup, lookupType]);

  async function lookupUser() {
    if (!lookup.trim()) return;
    setLooking(true);
    try {
      const r = await fetch("/api/admin/credits/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupType, lookup }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "User not found"); setFound(null); return; }
      setFound(d.user);
    } finally { setLooking(false); }
  }

  async function grant() {
    if (!found) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupType, lookup, amount, note }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success(`${amount > 0 ? "+" : ""}${amount} credits → balance now ${d.balanceAfter}`);
      setFound((f) => f ? { ...f, balance: d.balanceAfter } : null);
      setNote("");
      await loadGrants();
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Credits</h1>
        <p className="text-muted-foreground mt-1">Grant or deduct credits by email or Apple/Google Pass-ID.</p>
      </div>

      {/* ── Lookup form ── */}
      <Card>
        <CardHeader><CardTitle>Find user</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={lookupType} onValueChange={(v) => setLookupType(v as any)}>
            <TabsList>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="pass_id">Pass-ID</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <Input
              placeholder={lookupType === "email" ? "user@example.com" : "Wallet pass serial"}
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupUser()}
              className="flex-1"
            />
            <Button onClick={lookupUser} disabled={looking || !lookup.trim()} variant="secondary">
              <Search className="h-4 w-4 mr-2" /> Look up
            </Button>
          </div>

          {found && (
            <div className="rounded-xl border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{found.name}</p>
                  <p className="text-sm text-muted-foreground">{found.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Current balance</p>
                  <p className="text-2xl font-bold">{found.balance} <span className="text-sm font-normal">credits</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Amount (use negative to deduct)</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                    step={1}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input
                    placeholder="e.g. Competition prize"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={grant} disabled={saving || amount === 0} className="w-full">
                {amount >= 0
                  ? <><Plus className="h-4 w-4 mr-2" />Grant {amount} credits</>
                  : <><Minus className="h-4 w-4 mr-2" />Deduct {Math.abs(amount)} credits</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent grants ── */}
      {grants.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent adjustments</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {grants.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-6 py-3">
                  <Coins className="h-4 w-4 text-muted-foreground flex-none" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{g.profiles?.name ?? "—"} · {g.profiles?.email ?? "—"}</p>
                    {g.meta?.note && <p className="text-xs text-muted-foreground truncate">{g.meta.note}</p>}
                    {g.meta?.granted_by && <p className="text-xs text-muted-foreground">by {g.meta.granted_by}</p>}
                  </div>
                  <Badge variant={g.amount >= 0 ? "default" : "destructive"}>
                    {g.amount >= 0 ? "+" : ""}{g.amount}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(g.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
