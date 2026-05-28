"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tag, Plus, Trash2, Copy, CheckCircle2, Clock } from "lucide-react";
import type { PromoCode } from "@/lib/supabase/types";

const schema = z.object({
  code: z.string().min(2).max(32),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().min(0.01),
  usageLimit: z.coerce.number().int().min(1).optional().or(z.literal("")).transform(v => v === "" ? undefined : v),
  expiresAt: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  eventId: string;
  eventName: string;
  initialPromos: PromoCode[];
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function PromoManager({ eventId, eventName, initialPromos }: Props) {
  const [promos, setPromos] = useState<PromoCode[]>(initialPromos);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { discountType: "percent", discountValue: 10 } });

  const discountType = watch("discountType");

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const onSubmit = async (data: FormData) => {
    try {
      const res = await fetch(`/api/events/${eventId}/promos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          usageLimit: data.usageLimit || null,
          expiresAt: data.expiresAt || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create");
      }
      const promo = await res.json() as PromoCode;
      setPromos((prev) => [promo, ...prev]);
      toast.success(`Code ${promo.code} created`);
      setShowForm(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/events/${eventId}/promos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoId: deleteTarget.id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setPromos((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Promo code deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const isExpired = (p: PromoCode) => p.expires_at ? new Date(p.expires_at) < new Date() : false;
  const isExhausted = (p: PromoCode) => p.usage_limit != null && p.used_count >= p.usage_limit;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6" /> Promo Codes
          </h1>
          <p className="text-muted-foreground text-sm">{eventName}</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New Code"}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Promo Code</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Code */}
                <div className="col-span-2 space-y-1">
                  <Label>Code *</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="SUMMER20"
                      className="font-mono uppercase"
                      {...register("code")}
                      onChange={(e) => setValue("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
                    />
                    <Button type="button" variant="outline" onClick={() => setValue("code", generateCode())}>
                      Generate
                    </Button>
                  </div>
                  {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                </div>

                {/* Type + Value */}
                <div className="space-y-1">
                  <Label>Discount Type</Label>
                  <Select defaultValue="percent" onValueChange={(v) => setValue("discountType", v as "percent" | "fixed")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed amount (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Value *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      {discountType === "percent" ? "%" : "€"}
                    </span>
                    <Input type="number" min={0.01} step={0.01} className="pl-7" {...register("discountValue")} />
                  </div>
                  {errors.discountValue && <p className="text-xs text-destructive">{errors.discountValue.message}</p>}
                </div>

                {/* Usage limit + Expiry */}
                <div className="space-y-1">
                  <Label>Usage Limit <span className="text-muted-foreground">(optional)</span></Label>
                  <Input type="number" min={1} placeholder="Unlimited" {...register("usageLimit")} />
                </div>
                <div className="space-y-1">
                  <Label>Expires At <span className="text-muted-foreground">(optional)</span></Label>
                  <Input type="datetime-local" {...register("expiresAt")} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create Code"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Promo list */}
      {promos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Tag className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium mb-1">No promo codes yet</p>
          <p className="text-sm text-muted-foreground">Create codes to offer discounts to your audience.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map((p) => {
            const expired = isExpired(p);
            const exhausted = isExhausted(p);
            const inactive = expired || exhausted;
            return (
              <div key={p.id} className={`flex items-center gap-4 rounded-lg border p-4 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="font-mono font-bold text-base tracking-wider hover:text-primary transition-colors flex items-center gap-1.5"
                      onClick={() => copyCode(p.code)}
                      title="Copy code"
                    >
                      {p.code}
                      {copied === p.code
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        : <Copy className="h-3 w-3 text-muted-foreground" />}
                    </button>

                    <Badge variant="secondary" className="text-xs">
                      {p.discount_type === "percent"
                        ? `${p.discount_value}% off`
                        : `${formatCurrency(p.discount_value)} off`}
                    </Badge>

                    {expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                    {exhausted && !expired && <Badge variant="destructive" className="text-xs">Exhausted</Badge>}
                    {!inactive && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">Active</Badge>}
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>
                      Used: <strong className="text-foreground">{p.used_count}</strong>
                      {p.usage_limit != null && ` / ${p.usage_limit}`}
                    </span>
                    {p.expires_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {expired ? "Expired" : "Expires"} {new Date(p.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost" size="icon"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.code}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Any buyers who already used this code keep their discount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
