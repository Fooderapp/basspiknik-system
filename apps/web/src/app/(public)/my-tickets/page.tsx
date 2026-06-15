import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Ticket as TicketIcon, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: "My Tickets" };

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  VALID:     "success",
  USED:      "secondary",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
};
const STRIPE: Record<string, string> = {
  VALID: "#22c55e", USED: "#6b7280", CANCELLED: "#ef4444", REFUNDED: "#a1a1aa",
};

function statusLabel(dict: Dictionary, status: string): string {
  switch (status) {
    case "VALID": return t(dict, "mytickets.status_valid");
    case "USED": return t(dict, "mytickets.status_used");
    case "CANCELLED": return t(dict, "mytickets.status_cancelled");
    case "REFUNDED": return t(dict, "mytickets.status_refunded");
    default: return status;
  }
}

export default async function MyTicketsPage() {
  const supabase = await createClient() as any;
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getSettings(),
  ]);

  if (!user) redirect("/sign-in?redirectTo=/my-tickets");

  const dict = getDictionary(settings.language);

  // Owned (via order) + transferred-to-me — mirrors mobile query.
  const [{ data: owned }, { data: transferred }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, orders!inner(user_id)")
      .eq("orders.user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tickets")
      .select("*")
      .eq("transferred_to_user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const merged = [...(owned ?? []), ...(transferred ?? [])];
  const seen = new Set<string>();
  const tickets = merged
    .filter((tk: any) => (seen.has(tk.id) ? false : (seen.add(tk.id), true)))
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const count = tickets.length;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:py-10">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05]" style={{ letterSpacing: "-0.03em" }}>{t(dict, "mytickets.title")}</h1>
        <p className="text-muted-foreground text-base mt-2">
          {count} {count === 1 ? t(dict, "mytickets.count_one") : t(dict, "mytickets.count_other")}
        </p>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--pastel-sky)", color: "var(--pastel-sky-ink)" }}>
            <TicketIcon className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <p className="text-lg font-semibold tracking-tight">{t(dict, "mytickets.empty")}</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">{t(dict, "mytickets.empty_sub2")}</p>
          <Button asChild variant="brand">
            <Link href="/events">{t(dict, "mytickets.browse")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((tk: any) => (
            <Link
              key={tk.id}
              href={`/tickets/${tk.id}`}
              className="relative flex items-center gap-4 overflow-hidden rounded-[2.25rem] p-4 transition-transform hover:-translate-y-0.5"
              style={{ background: "#E5E5E5" }}
            >
              {/* status stripe */}
              <span
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: STRIPE[tk.status] ?? "#6b7280" }}
              />
              <div className="ml-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-white">
                <TicketIcon className="h-[19px] w-[19px]" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold tracking-tight truncate">{tk.ticket_name ?? "Ticket"}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[tk.status] ?? "secondary"} className="text-xs">
                    {statusLabel(dict, tk.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(tk.created_at)}</span>
                </div>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
