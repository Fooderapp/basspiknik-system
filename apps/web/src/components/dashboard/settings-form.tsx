"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Globe, DollarSign, Save } from "lucide-react";
import type { AppSettings, Currency, Language } from "@/lib/settings";

const CURRENCIES: { value: Currency; label: string; symbol: string; note?: string }[] = [
  { value: "EUR", label: "Euro",         symbol: "€" },
  { value: "USD", label: "US Dollar",    symbol: "$" },
  { value: "HUF", label: "Hungarian Forint", symbol: "Ft", note: "Zero-decimal" },
];

const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: "en", label: "English",   flag: "🇬🇧" },
  { value: "hu", label: "Hungarian", flag: "🇭🇺" },
];

interface SettingsFormProps {
  initialSettings: AppSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [currency, setCurrency] = useState<Currency>(initialSettings.currency);
  const [language, setLanguage] = useState<Language>(initialSettings.language);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleCurrency = (val: string) => { setCurrency(val as Currency); setDirty(true); };
  const handleLanguage = (val: string) => { setLanguage(val as Language); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Settings saved");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const selectedCurrency = CURRENCIES.find((c) => c.value === currency);
  const selectedLanguage = LANGUAGES.find((l) => l.value === language);

  return (
    <div className="space-y-6">

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Language
          </CardTitle>
          <CardDescription>
            Sets the display language for the entire platform, including emails and tickets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Platform language</Label>
            <Select value={language} onValueChange={handleLanguage}>
              <SelectTrigger className="w-64">
                <SelectValue>
                  {selectedLanguage && (
                    <span className="flex items-center gap-2">
                      <span>{selectedLanguage.flag}</span>
                      <span>{selectedLanguage.label}</span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    <span className="flex items-center gap-2">
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Currency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            Currency
          </CardTitle>
          <CardDescription>
            Currency used for Stripe payments and price display. Ticket prices in the database
            are treated as amounts in the selected currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Payment currency</Label>
            <Select value={currency} onValueChange={handleCurrency}>
              <SelectTrigger className="w-64">
                <SelectValue>
                  {selectedCurrency && (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">{selectedCurrency.symbol}</span>
                      <span>{selectedCurrency.label}</span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono w-4 text-center text-muted-foreground">{c.symbol}</span>
                      <span>{c.label}</span>
                      {c.note && <span className="text-xs text-muted-foreground">({c.note})</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currency === "HUF" && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <strong>HUF note:</strong> Stripe treats HUF as a zero-decimal currency. Ticket
              prices are charged in whole forints (e.g. a price of 1500 = 1 500 Ft).
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Changes take effect immediately for new purchases.
        </p>
        <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
