import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { User, Mail, Hash, Star, ScanLine, CreditCard, Beer, ChevronRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/components/consumer/sign-out-button";
import { BillingSection } from "@/components/consumer/billing-section";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
  ]);
  const dict = getDictionary(settings.language);

  if (!user) {
    return (
      <div className="container max-w-md px-4 py-16 text-center">
        <User className="h-10 w-10 mx-auto mb-4 text-muted-foreground/40" />
        <p className="text-muted-foreground mb-6">{t(dict, "profile.sign_in_prompt")}</p>
        <Button asChild variant="brand">
          <Link href="/sign-in?redirectTo=/profile">{t(dict, "nav.sign_in")}</Link>
        </Button>
      </div>
    );
  }

  const [{ data: profile }, { data: balance }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.rpc("get_credit_balance", { p_user_id: user.id }),
  ]);

  const p = (profile ?? {}) as any;
  const walletToken: string | null = p.wallet_token ?? null;
  const displayId: string | null = p.display_id ?? null;
  const credits = typeof balance === "number" ? balance : 0;
  const role: string = p.role ?? "GUEST";

  type TKey = Parameters<typeof t>[1];
  const STAFF_TOOLS: { href: string; icon: LucideIcon; labelKey: TKey; subKey: TKey; roles: string[] }[] = [
    { href: "/checkin", icon: ScanLine,   labelKey: "profile.checkin", subKey: "profile.checkin_sub", roles: ["ADMIN", "EDITOR", "STAFF"] },
    { href: "/seller",  icon: CreditCard, labelKey: "profile.sell",    subKey: "profile.sell_sub",    roles: ["ADMIN", "EDITOR", "SELLER"] },
    { href: "/bar",     icon: Beer,       labelKey: "profile.bar",     subKey: "profile.bar_sub",     roles: ["ADMIN", "EDITOR", "STAFF", "BARTENDER"] },
  ];
  const tools = STAFF_TOOLS.filter((tool) => tool.roles.includes(role));

  return (
    <div className="container max-w-md px-4 py-8 md:py-12">
      {/* Title + credit chip */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.03em" }}>{t(dict, "profile.title")}</h1>
          <p className="text-base text-muted-foreground mt-1.5">{t(dict, "profile.subtitle")}</p>
        </div>
        <Link
          href="/events"
          className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 shadow-sm"
        >
          <Star size={13} color="#163300" strokeWidth={2.5} fill="#9FE870" />
          <span className="font-semibold text-sm">{credits}</span>
          <span className="text-xs text-muted-foreground">{t(dict, "profile.credits")}</span>
        </Link>
      </div>

      {/* Entry pass */}
      {walletToken && (
        <div className="mb-6">
          <div className="rounded-[2.25rem] p-6" style={{ background: "#E5E5E5" }}>
            <p className="text-[11px] font-semibold tracking-[2px] text-muted-foreground mb-5">
              {t(dict, "profile.entry_pass")}
            </p>
            <p className="text-2xl font-bold tracking-tight line-clamp-1">{p.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground mb-5 line-clamp-1">{p.email ?? user.email}</p>
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-[2.25rem]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/tickets/qr?code=${encodeURIComponent(walletToken)}`}
                  alt="Entry pass QR"
                  width={196}
                  height={196}
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-5">
              <div>
                <p className="text-[10px] tracking-wider text-muted-foreground">{t(dict, "profile.bass_id")}</p>
                <p className="font-mono font-semibold">{displayId ?? "—"}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">{t(dict, "profile.scan")}</p>
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground px-6 mt-3">
            {t(dict, "profile.share_hint")}
          </p>
        </div>
      )}

      {/* Staff tools — role-gated, mirrors the mobile app's Profile screen */}
      {tools.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(dict, "profile.staff_tools")}</p>
          <div className="space-y-3">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm transition-colors hover:bg-muted"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold tracking-tight">{t(dict, tool.labelKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(dict, tool.subKey)}</p>
                  </div>
                  <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Account info */}
      <div className="rounded-[2.25rem] p-4 space-y-3 mb-6" style={{ background: "#E5E5E5" }}>
        <Row icon={<User className="h-4 w-4 text-muted-foreground" />} label={t(dict, "profile.name")} value={p.name ?? "—"} />
        <Separator />
        <Row icon={<Mail className="h-4 w-4 text-muted-foreground" />} label={t(dict, "profile.email")} value={p.email ?? user.email} />
        {displayId && (
          <>
            <Separator />
            <Row icon={<Hash className="h-4 w-4 text-muted-foreground" />} label={t(dict, "profile.bass_id")} value={displayId} mono />
          </>
        )}
      </div>

      {/* Billing address */}
      <BillingSection
        initial={{
          billing_name:        p.billing_name        ?? "",
          billing_address:     p.billing_address     ?? "",
          billing_city:        p.billing_city        ?? "",
          billing_postal_code: p.billing_postal_code ?? "",
          billing_country:     p.billing_country     ?? "Magyarország",
        }}
      />

      <div className="mt-2">
        <SignOutButton label={t(dict, "profile.sign_out")} />
      </div>
    </div>
  );
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-semibold truncate ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
