"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, Check, X } from "lucide-react";
import type { DrinkCategoryRow } from "@/lib/supabase/types";
import type { Dictionary } from "@/lib/i18n";

interface Props {
  initialCategories: DrinkCategoryRow[];
  dict: Dictionary;
}

interface EditState {
  name: string;
  name_hu: string;
  emoji: string;
  color: string;
  sort_order: number;
}

const PRESET_COLORS = [
  "#db2777","#d97706","#dc2626","#ea580c","#0891b2","#9333ea","#6b7280",
  "#16a34a","#2563eb","#7c3aed","#be123c","#b45309",
];

export function CategoriesManager({ initialCategories, dict }: Props) {
  const t = (k: keyof Dictionary) => dict[k] ?? k;

  const [categories, setCategories] = useState<DrinkCategoryRow[]>(initialCategories);
  const [editingId, setEditingId]   = useState<string | "new" | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState<EditState>({ name: "", name_hu: "", emoji: "🍹", color: "#374151", sort_order: 0 });

  function openNew() {
    setForm({ name: "", name_hu: "", emoji: "🍹", color: "#374151", sort_order: categories.length });
    setEditingId("new");
  }

  function openEdit(cat: DrinkCategoryRow) {
    setForm({ name: cat.name, name_hu: cat.name_hu ?? "", emoji: cat.emoji, color: cat.color, sort_order: cat.sort_order });
    setEditingId(cat.id);
  }

  function cancelEdit() { setEditingId(null); }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form, name_hu: form.name_hu || null };
      let res: Response;
      if (editingId === "new") {
        res = await fetch("/api/bar/categories", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/bar/categories/${editingId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (editingId === "new") {
        setCategories(prev => [...prev, data]);
      } else {
        setCategories(prev => prev.map(c => c.id === editingId ? data : c));
      }
      setEditingId(null);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/bar/categories/${deleteId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setCategories(prev => prev.filter(c => c.id !== deleteId));
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("cat.add")}
        </Button>
      </div>

      {/* Inline "new" form */}
      {editingId === "new" && (
        <CategoryForm form={form} setForm={setForm} saving={saving} onSave={save} onCancel={cancelEdit} dict={dict} presetColors={PRESET_COLORS} />
      )}

      {/* Category list */}
      {categories.length === 0 && editingId !== "new" ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("cat.empty")}</p>
      ) : (
        <div className="space-y-2">
          {categories
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(cat => (
              <div key={cat.id}>
                {editingId === cat.id ? (
                  <CategoryForm form={form} setForm={setForm} saving={saving} onSave={save} onCancel={cancelEdit} dict={dict} presetColors={PRESET_COLORS} />
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border bg-card p-3 group">
                    <GripVertical className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                    <span className="text-2xl w-8 text-center">{cat.emoji}</span>
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{cat.name}</p>
                      {cat.name_hu && <p className="text-xs text-muted-foreground">{cat.name_hu}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(cat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(cat.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cat.confirm_delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cat.confirm_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cat.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("cat.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryForm({ form, setForm, saving, onSave, onCancel, dict, presetColors }: {
  form: EditState;
  setForm: React.Dispatch<React.SetStateAction<EditState>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  dict: Dictionary;
  presetColors: string[];
}) {
  const t = (k: keyof Dictionary) => dict[k] ?? k;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("cat.name")}</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Beer" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("cat.name_hu")}</Label>
          <Input value={form.name_hu} onChange={e => setForm(f => ({ ...f, name_hu: e.target.value }))} placeholder="Sör" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("cat.emoji")}</Label>
          <Input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} className="text-lg" maxLength={4} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("cat.sort")}</Label>
          <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} min={0} />
        </div>
      </div>
      {/* Color picker */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("cat.color")}</Label>
        <div className="flex flex-wrap gap-2 items-center">
          {presetColors.map(c => (
            <button
              key={c}
              onClick={() => setForm(f => ({ ...f, color: c }))}
              className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{ backgroundColor: c, borderColor: form.color === c ? "white" : "transparent", outline: form.color === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent"
            title="Custom colour"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={saving || !form.name.trim()} className="gap-1.5">
          <Check className="h-3.5 w-3.5" />
          {t("cat.save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          {t("cat.cancel")}
        </Button>
      </div>
    </div>
  );
}
