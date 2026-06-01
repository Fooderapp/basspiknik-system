"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Ticket, Users, Tag, PackageOpen, RefreshCcw } from "lucide-react";
import type { TicketType } from "@/lib/supabase/types";

const TIERS = ["EARLY_BIRD", "GENERAL", "LATE", "DOOR", "VIP", "FREE"] as const;
const TIER_LABELS: Record<string, string> = {
  EARLY_BIRD: "Early Bird", GENERAL: "General", LATE: "Late",
  DOOR: "Door", VIP: "VIP", FREE: "Free",
};
const TIER_COLORS: Record<string, string> = {
  EARLY_BIRD: "bg-muted text-foreground",
  GENERAL:    "bg-muted text-foreground",
  LATE:       "bg-muted text-foreground",
  DOOR:       "bg-muted text-foreground",
  VIP:        "bg-foreground text-background",
  FREE:       "bg-muted text-muted-foreground",
};

const schema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  tier: z.enum(TIERS),
  maxPerOrder: z.coerce.number().int().min(1).default(10),
  // Multiple entries
  entriesPerTicket: z.coerce.number().int().min(1).default(1),
  // Bundle
  isBundle: z.boolean().default(false),
  bundleSize: z.coerce.number().int().min(2).optional(),
  // Sale price
  saleEnabled: z.boolean().default(false),
  salePrice: z.coerce.number().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  eventId: string;
  initialTicketTypes: TicketType[];
}

// Toggle row component for consistent styling
function ToggleRow({
  id, icon: Icon, label, description, checked, onCheckedChange, children,
}: {
  id: string; icon: React.ElementType; label: string; description: string;
  checked: boolean; onCheckedChange: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-3 transition-colors ${checked ? "border-primary/50 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium leading-none">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children && <div className="pt-1 border-t">{children}</div>}
    </div>
  );
}

export function TicketTypeManager({ eventId, initialTicketTypes }: Props) {
  const router = useRouter();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(initialTicketTypes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketType | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { tier: "GENERAL", maxPerOrder: 10, entriesPerTicket: 1, isBundle: false, saleEnabled: false } });

  const isBundle = watch("isBundle");
  const saleEnabled = watch("saleEnabled");
  const entriesPerTicket = watch("entriesPerTicket") ?? 1;

  const openAdd = () => {
    setEditing(null);
    reset({ tier: "GENERAL", maxPerOrder: 10, entriesPerTicket: 1, isBundle: false, saleEnabled: false, price: 0, quantity: 100 });
    setDialogOpen(true);
  };

  const openEdit = (tt: TicketType) => {
    setEditing(tt);
    reset({
      name: tt.name,
      description: tt.description ?? "",
      price: tt.price,
      quantity: tt.quantity,
      tier: tt.tier,
      maxPerOrder: tt.max_per_order,
      entriesPerTicket: tt.entries_per_ticket ?? 1,
      isBundle: tt.is_bundle,
      bundleSize: tt.bundle_size ?? undefined,
      saleEnabled: tt.sale_enabled ?? false,
      salePrice: tt.sale_price ?? undefined,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: FormData) => {
    const url = editing
      ? `/api/events/${eventId}/tickets/${editing.id}`
      : `/api/events/${eventId}/tickets`;

    try {
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          price: data.price,
          quantity: data.quantity,
          tier: data.tier,
          maxPerOrder: data.maxPerOrder,
          entriesPerTicket: data.entriesPerTicket,
          isBundle: data.isBundle,
          bundleSize: data.isBundle ? data.bundleSize : null,
          saleEnabled: data.saleEnabled,
          salePrice: data.saleEnabled ? data.salePrice : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }

      const saved = await res.json() as TicketType;
      setTicketTypes((prev) =>
        editing ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]
      );
      toast.success(editing ? "Ticket type updated" : "Ticket type added");
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/events/${eventId}/tickets/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Delete failed");
      }
      setTicketTypes((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Ticket type deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Ticket className="h-5 w-5" /> Ticket Types
          </h2>
          <p className="text-sm text-muted-foreground">
            {ticketTypes.length === 0 ? "No ticket types yet" : `${ticketTypes.length} type${ticketTypes.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Ticket Type
        </Button>
      </div>

      {ticketTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Ticket className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium mb-1">No ticket types</p>
          <p className="text-sm text-muted-foreground mb-4">Add at least one ticket type so people can buy tickets.</p>
          <Button onClick={openAdd} variant="outline"><Plus className="h-4 w-4 mr-1" /> Add First Ticket Type</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ticketTypes.map((tt) => {
            const pct = tt.quantity > 0 ? Math.round((tt.sold / tt.quantity) * 100) : 0;
            const displayPrice = tt.sale_enabled && tt.sale_price != null ? tt.sale_price : tt.price;
            return (
              <Card key={tt.id} className="relative">
                <CardHeader className="pb-2 pr-20">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[tt.tier]}`}>
                      {TIER_LABELS[tt.tier]}
                    </span>
                    {tt.is_bundle && <Badge variant="outline" className="text-[11px]">Bundle ×{tt.bundle_size}</Badge>}
                    {(tt.entries_per_ticket ?? 1) > 1 && (
                      <Badge variant="outline" className="text-[11px]">
                        <RefreshCcw className="h-2.5 w-2.5 mr-1" />{tt.entries_per_ticket}× entry
                      </Badge>
                    )}
                    {tt.sale_enabled && tt.sale_price != null && (
                      <Badge className="text-[11px] bg-foreground text-background border-0">Sale</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-1">{tt.name}</CardTitle>
                  {tt.description && <p className="text-xs text-muted-foreground">{tt.description}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold">{formatCurrency(displayPrice)}</span>
                      {tt.sale_enabled && tt.sale_price != null && (
                        <span className="text-sm text-muted-foreground line-through">{formatCurrency(tt.price)}</span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />{tt.sold}/{tt.quantity}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-muted-foreground" : "bg-primary"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tt.quantity - tt.sold} remaining · max {tt.max_per_order}/order
                  </p>
                </CardContent>
                <div className="absolute top-3 right-3 flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tt)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(tt)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Ticket Type" : "Add Ticket Type"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Name */}
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input placeholder="General Admission" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Optional details shown to buyers…" {...register("description")} />
            </div>

            {/* Price + Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                  <Input type="number" min={0} step={0.01} className="pl-7" placeholder="0.00" {...register("price")} />
                </div>
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Quantity *</Label>
                <Input type="number" min={1} placeholder="100" {...register("quantity")} />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
              </div>
            </div>

            {/* Tier + Max per order */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tier</Label>
                <Select defaultValue={watch("tier")} onValueChange={(v) => setValue("tier", v as typeof TIERS[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Max per order</Label>
                <Input type="number" min={1} {...register("maxPerOrder")} />
              </div>
            </div>

            {/* ── Feature toggles ── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Options</p>

              {/* Multi-entry */}
              <ToggleRow
                id="multiEntry"
                icon={RefreshCcw}
                label="Multiple entries"
                description="This ticket allows re-entry (e.g. day pass, VIP all-day)"
                checked={(entriesPerTicket ?? 1) > 1}
                onCheckedChange={(v) => setValue("entriesPerTicket", v ? 2 : 1)}
              >
                <div className="flex items-center gap-3">
                  <Label className="text-sm whitespace-nowrap">Number of entries</Label>
                  <Input
                    type="number" min={2} max={99}
                    className="w-24"
                    {...register("entriesPerTicket")}
                  />
                  <p className="text-xs text-muted-foreground">Each scan counts as one use</p>
                </div>
              </ToggleRow>

              {/* Bundle */}
              <ToggleRow
                id="bundle"
                icon={PackageOpen}
                label="Bundle ticket"
                description="Sell multiple tickets for one price (e.g. 3 for €25)"
                checked={isBundle}
                onCheckedChange={(v) => setValue("isBundle", v)}
              >
                <div className="flex items-center gap-3">
                  <Label className="text-sm whitespace-nowrap">Tickets in bundle</Label>
                  <Input
                    type="number" min={2} max={100}
                    className="w-24"
                    placeholder="3"
                    {...register("bundleSize")}
                  />
                  <p className="text-xs text-muted-foreground">Generates this many QR codes per purchase</p>
                </div>
              </ToggleRow>

              {/* Sale price */}
              <ToggleRow
                id="salePrice"
                icon={Tag}
                label="Sale price"
                description="Show a discounted price with the original crossed out"
                checked={saleEnabled}
                onCheckedChange={(v) => setValue("saleEnabled", v)}
              >
                <div className="flex items-center gap-3">
                  <Label className="text-sm whitespace-nowrap">Sale price</Label>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                    <Input
                      type="number" min={0} step={0.01}
                      className="pl-7"
                      placeholder="0.00"
                      {...register("salePrice")}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Original price shown crossed out</p>
                </div>
              </ToggleRow>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : editing ? "Update" : "Add Ticket Type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Ticket types with existing sales cannot be deleted.
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
