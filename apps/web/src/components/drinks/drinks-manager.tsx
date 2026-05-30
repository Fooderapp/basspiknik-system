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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Wine, Star, Eye, EyeOff } from "lucide-react";
import type { Drink, DrinkCategory, DrinkCategoryRow } from "@/lib/supabase/types";

const CATEGORIES: { value: DrinkCategory; label: string; emoji: string }[] = [
  { value: "COCKTAIL",   label: "Cocktail",   emoji: "🍹" },
  { value: "BEER",       label: "Beer",       emoji: "🍺" },
  { value: "WINE",       label: "Wine",       emoji: "🍷" },
  { value: "SPIRIT",     label: "Spirit",     emoji: "🥃" },
  { value: "SOFT_DRINK", label: "Soft Drink", emoji: "🥤" },
  { value: "SHOT",       label: "Shot",       emoji: "🥊" },
  { value: "OTHER",      label: "Other",      emoji: "🍶" },
];

const schema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  category: z.enum(["COCKTAIL","BEER","WINE","SPIRIT","SOFT_DRINK","SHOT","OTHER"]),
  price: z.coerce.number().min(0),
  available: z.boolean().default(true),
  saleEnabled: z.boolean().default(false),
  salePrice: z.coerce.number().min(0).optional(),
  isPopular: z.boolean().default(false),
  allergens: z.string().optional(), // comma-separated, parsed on submit
  sortOrder: z.coerce.number().int().default(0),
});
type FormData = z.infer<typeof schema>;

interface Props { initialDrinks: Drink[]; initialCategories?: DrinkCategoryRow[] }

const CATEGORY_COLORS: Record<string, string> = {
  COCKTAIL:   "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  BEER:       "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  WINE:       "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  SPIRIT:     "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  SOFT_DRINK: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  SHOT:       "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  OTHER:      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export function DrinksManager({ initialDrinks, initialCategories = [] }: Props) {
  const [drinks, setDrinks] = useState<Drink[]>(initialDrinks);
  const [customCategories] = useState<DrinkCategoryRow[]>(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Drink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Drink | null>(null);
  const [filter, setFilter] = useState<DrinkCategory | "ALL">("ALL");

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: { category: "COCKTAIL", available: true, saleEnabled: false, isPopular: false, sortOrder: 0 },
    });

  const saleEnabled = watch("saleEnabled");

  const openAdd = () => {
    setEditing(null);
    reset({ category: "COCKTAIL", available: true, saleEnabled: false, isPopular: false, sortOrder: drinks.length });
    setDialogOpen(true);
  };

  const openEdit = (d: Drink) => {
    setEditing(d);
    reset({
      name: d.name,
      description: d.description ?? "",
      category: d.category,
      price: d.price,
      available: d.available,
      saleEnabled: d.sale_enabled,
      salePrice: d.sale_price ?? undefined,
      isPopular: d.is_popular,
      allergens: d.allergens?.join(", ") ?? "",
      sortOrder: d.sort_order,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: FormData) => {
    const payload = {
      name: data.name,
      description: data.description || null,
      category: data.category,
      price: data.price,
      available: data.available,
      saleEnabled: data.saleEnabled,
      salePrice: data.saleEnabled ? data.salePrice : null,
      isPopular: data.isPopular,
      allergens: data.allergens ? data.allergens.split(",").map(s => s.trim()).filter(Boolean) : [],
      sortOrder: data.sortOrder,
    };

    try {
      const url = editing ? `/api/drinks/${editing.id}` : "/api/drinks";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
      const saved = await res.json() as Drink;
      setDrinks(prev => editing
        ? prev.map(d => d.id === saved.id ? saved : d)
        : [...prev, saved].sort((a, b) => a.sort_order - b.sort_order));
      toast.success(editing ? "Drink updated" : "Drink added");
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const toggleAvailable = async (drink: Drink) => {
    try {
      const res = await fetch(`/api/drinks/${drink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available: !drink.available }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json() as Drink;
      setDrinks(prev => prev.map(d => d.id === updated.id ? updated : d));
    } catch {
      toast.error("Failed to update availability");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/drinks/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setDrinks(prev => prev.filter(d => d.id !== deleteTarget.id));
      toast.success("Drink deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const filtered = filter === "ALL" ? drinks : drinks.filter(d => d.category === filter);
  const counts = CATEGORIES.reduce((acc, c) => ({ ...acc, [c.value]: drinks.filter(d => d.category === c.value).length }), {} as Record<string, number>);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === "ALL" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
          >
            All ({drinks.length})
          </button>
          {CATEGORIES.filter(c => counts[c.value] > 0).map(c => (
            <button
              key={c.value}
              onClick={() => setFilter(c.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === c.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            >
              {c.emoji} {c.label} ({counts[c.value]})
            </button>
          ))}
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Drink
        </Button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Wine className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium mb-1">No drinks yet</p>
          <p className="text-sm text-muted-foreground mb-4">Add your first drink to the menu.</p>
          <Button onClick={openAdd} variant="outline"><Plus className="h-4 w-4 mr-1" /> Add First Drink</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((drink) => {
            const cat = CATEGORIES.find(c => c.value === drink.category);
            const displayPrice = drink.sale_enabled && drink.sale_price != null ? drink.sale_price : drink.price;
            return (
              <div key={drink.id} className={`rounded-lg border bg-card p-4 space-y-2 relative ${!drink.available ? "opacity-60" : ""}`}>
                {/* Badges row */}
                <div className="flex items-center gap-1.5 flex-wrap pr-16">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[drink.category]}`}>
                    {cat?.emoji} {cat?.label}
                  </span>
                  {drink.is_popular && <Badge className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 border-0"><Star className="h-2.5 w-2.5 mr-0.5" />Popular</Badge>}
                  {drink.sale_enabled && <Badge className="text-[11px] bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 border-0">Sale</Badge>}
                  {!drink.available && <Badge variant="secondary" className="text-[11px]">Unavailable</Badge>}
                </div>

                <div>
                  <p className="font-semibold">{drink.name}</p>
                  {drink.description && <p className="text-xs text-muted-foreground line-clamp-2">{drink.description}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{formatCurrency(displayPrice)}</span>
                  {drink.sale_enabled && drink.sale_price != null && (
                    <span className="text-sm text-muted-foreground line-through">{formatCurrency(drink.price)}</span>
                  )}
                </div>

                {drink.allergens?.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">⚠️ {drink.allergens.join(", ")}</p>
                )}

                {/* Actions */}
                <div className="absolute top-3 right-3 flex gap-1">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title={drink.available ? "Mark unavailable" : "Mark available"}
                    onClick={() => toggleAvailable(drink)}
                  >
                    {drink.available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(drink)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(drink)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Drink" : "Add Drink"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input placeholder="Mojito" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Rum, lime, mint, sugar, soda…" {...register("description")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Category *</Label>
                <Select defaultValue={watch("category")} onValueChange={v => setValue("category", v as DrinkCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {customCategories.length > 0 && customCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
                    ))}
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                  <Input type="number" min={0} step={0.01} className="pl-7" {...register("price")} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Sort Order</Label>
                <Input type="number" min={0} {...register("sortOrder")} />
              </div>
              <div className="space-y-1">
                <Label>Allergens <span className="text-muted-foreground">(comma-separated)</span></Label>
                <Input placeholder="nuts, dairy…" {...register("allergens")} />
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              {[
                { id: "available", label: "Available", desc: "Show on menu and accept orders", field: "available" as const },
                { id: "isPopular", label: "Mark as Popular", desc: "Highlighted with a star badge", field: "isPopular" as const },
              ].map(({ id, label, desc, field }) => (
                <div key={id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch checked={!!watch(field)} onCheckedChange={v => setValue(field, v)} />
                </div>
              ))}

              {/* Sale price toggle */}
              <div className={`rounded-lg border p-3 space-y-3 ${saleEnabled ? "border-primary/50 bg-primary/5" : ""}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Sale Price</p>
                    <p className="text-xs text-muted-foreground">Original price shown crossed out</p>
                  </div>
                  <Switch checked={saleEnabled} onCheckedChange={v => setValue("saleEnabled", v)} />
                </div>
                {saleEnabled && (
                  <div className="flex items-center gap-3 pt-1 border-t">
                    <Label className="text-sm whitespace-nowrap">Sale price</Label>
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                      <Input type="number" min={0} step={0.01} className="pl-7" {...register("salePrice")} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : editing ? "Update" : "Add Drink"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the drink from the menu permanently.</AlertDialogDescription>
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
