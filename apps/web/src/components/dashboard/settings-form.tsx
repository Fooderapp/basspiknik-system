"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Globe, DollarSign, Save, Coins, Receipt, Wallet } from "lucide-react";
import type { AppSettings, Currency, Language } from "@/lib/settings";

const CURRENCIES: { value: Currency; label: string; symbol: string; note?: string }[] = [
  { value: "EUR", label: "Euro",         symbol: "€" },
  { value: "USD", label: "US Dollar",    symbol: "$" },
  { value: "HUF", label: "Hungarian Forint", symbol: "Ft" },
];

const LANGUAGES: { value: Language; label: string; code: string }[] = [
  { value: "en", label: "English",   code: "EN" },
  { value: "hu", label: "Hungarian", code: "HU" },
];

interface SettingsFormProps {
  initialSettings: AppSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [currency, setCurrency] = useState<Currency>(initialSettings.currency);
  const [language, setLanguage] = useState<Language>(initialSettings.language);
  const [creditsEnabled, setCreditsEnabled] = useState(true);
  const [creditsPerTicket, setCreditsPerTicket] = useState(4);
  const [creditsPerDrink, setCreditsPerDrink] = useState(1);
  const [spinCost, setSpinCost] = useState(4);
  const [spinWinRate, setSpinWinRate] = useState(20);
  const [invoicePosCash, setInvoicePosCash] = useState(true);
  // Credit redemption (apply credits at checkout)
  const [creditRedeemEnabled, setCreditRedeemEnabled] = useState(false);
  const [creditValueHuf, setCreditValueHuf] = useState(0);
  const [creditMaxApply, setCreditMaxApply] = useState(0);
  const [creditMaxPct, setCreditMaxPct] = useState(50);
  const [creditMinRedeem, setCreditMinRedeem] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Credit fields aren't part of getSettings() — pull them from the admin API
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.credits_enabled !== undefined) setCreditsEnabled(!!d.credits_enabled);
        if (d.credits_per_ticket != null) setCreditsPerTicket(d.credits_per_ticket);
        if (d.credits_per_drink != null) setCreditsPerDrink(d.credits_per_drink);
        if (d.spin_cost != null) setSpinCost(d.spin_cost);
        if (d.spin_win_rate != null) setSpinWinRate(d.spin_win_rate);
        if (d.invoice_pos_cash !== undefined) setInvoicePosCash(!!d.invoice_pos_cash);
        if (d.credit_redeem_enabled !== undefined) setCreditRedeemEnabled(!!d.credit_redeem_enabled);
        if (d.credit_value_huf != null) setCreditValueHuf(Number(d.credit_value_huf));
        if (d.credit_max_apply != null) setCreditMaxApply(d.credit_max_apply);
        if (d.credit_max_pct != null) setCreditMaxPct(d.credit_max_pct);
        if (d.credit_min_redeem != null) setCreditMinRedeem(d.credit_min_redeem);
      })
      .catch(() => {});
  }, []);

  const handleCurrency = (val: string) => { setCurrency(val as Currency); setDirty(true); };
  const handleLanguage = (val: string) => { setLanguage(val as Language); setDirty(true); };
  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(Math.max(0, parseInt(e.target.value || "0", 10))); setDirty(true);
  };
  const dec = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(Math.max(0, parseFloat(e.target.value || "0"))); setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency, language, creditsEnabled, creditsPerTicket,
          creditsPerDrink, spinCost, spinWinRate, invoicePosCash,
          creditRedeemEnabled, creditValueHuf, creditMaxApply,
          creditMaxPct, creditMinRedeem,
        }),
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
                      <span className="text-[10px] font-mono font-semibold border border-border rounded px-1 py-0.5">{selectedLanguage.code}</span>
                      <span>{selectedLanguage.label}</span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-semibold border border-border rounded px-1 py-0.5">{l.code}</span>
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

        </CardContent>
      </Card>

      {/* Credits & Spin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4" />
            Credits &amp; Free Spin
          </CardTitle>
          <CardDescription>
            Users earn credits on purchases and can spend them on a slot-machine spin.
            A win makes the checkout free.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable credits &amp; spin</Label>
              <p className="text-xs text-muted-foreground">Master switch for the whole feature.</p>
            </div>
            <Switch
              checked={creditsEnabled}
              onCheckedChange={(v) => { setCreditsEnabled(v); setDirty(true); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Credits per ticket order</Label>
              <Input type="number" min={0} value={creditsPerTicket} onChange={num(setCreditsPerTicket)} />
            </div>
            <div className="space-y-2">
              <Label>Credits per drink order</Label>
              <Input type="number" min={0} value={creditsPerDrink} onChange={num(setCreditsPerDrink)} />
            </div>
            <div className="space-y-2">
              <Label>Spin cost (credits)</Label>
              <Input type="number" min={1} value={spinCost} onChange={num(setSpinCost)} />
            </div>
            <div className="space-y-2">
              <Label>Win rate (1 in N)</Label>
              <Input type="number" min={1} value={spinWinRate} onChange={num(setSpinWinRate)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Win chance ≈ {spinWinRate > 0 ? (100 / spinWinRate).toFixed(1) : "0"}% per spin.
          </p>
        </CardContent>
      </Card>

      {/* Credit redemption at checkout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Credit redemption (checkout discount)
          </CardTitle>
          <CardDescription>
            Let buyers slide earned credits onto a checkout for a discount, instead of a promo code.
            The discount is capped by the limits below and never exceeds the order total.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable credit redemption</Label>
              <p className="text-xs text-muted-foreground">Master switch for applying credits at checkout.</p>
            </div>
            <Switch
              checked={creditRedeemEnabled}
              onCheckedChange={(v) => { setCreditRedeemEnabled(v); setDirty(true); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>1 credit = ? Ft</Label>
              <Input type="number" min={0} step="0.01" value={creditValueHuf} onChange={dec(setCreditValueHuf)} />
            </div>
            <div className="space-y-2">
              <Label>Max credits per order (0 = no limit)</Label>
              <Input type="number" min={0} value={creditMaxApply} onChange={num(setCreditMaxApply)} />
            </div>
            <div className="space-y-2">
              <Label>Max discount (% of order)</Label>
              <Input type="number" min={0} max={100} value={creditMaxPct} onChange={num(setCreditMaxPct)} />
            </div>
            <div className="space-y-2">
              <Label>Min credits to redeem</Label>
              <Input type="number" min={0} value={creditMinRedeem} onChange={num(setCreditMinRedeem)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {creditValueHuf > 0
              ? `Each credit is worth ${creditValueHuf} Ft. A buyer can cover up to ${creditMaxPct}% of an order` +
                (creditMaxApply > 0 ? `, max ${creditMaxApply} credits.` : `.`)
              : "Set a forint value above 0 to activate redemption."}
          </p>
        </CardContent>
      </Card>

      {/* Invoicing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Invoicing
          </CardTitle>
          <CardDescription>
            Billingo e-invoices are always issued for online and POS card-terminal sales.
            Free (spin-won) tickets are never invoiced.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Invoice POS cash sales</Label>
              <p className="text-xs text-muted-foreground">
                When off, cash sales at the door skip invoicing. Card terminal sales still invoice.
              </p>
            </div>
            <Switch
              checked={invoicePosCash}
              onCheckedChange={(v) => { setInvoicePosCash(v); setDirty(true); }}
            />
          </div>
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
