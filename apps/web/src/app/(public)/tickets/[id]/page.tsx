import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronLeft, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TransferTicketButton } from "@/components/tickets/transfer-ticket-dialog";
import { formatDate } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getDictionary, t } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  VALID:     "success",
  USED:      "secondary",
  CANCELLED: "destructive",
  REFUNDED:  "secondary",
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

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient() as any;
  const [{ data: ticket }, settings] = await Promise.all([
    supabase.from("tickets").select("*").eq("id", id).single(),
    getSettings(),
  ]);
  const dict = getDictionary(settings.language);

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="text-lg">{t(dict, "ticketdetail.not_found")}</p>
        <Link href="/my-tickets" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          {t(dict, "ticketdetail.go_back")}
        </Link>
      </div>
    );
  }

  const tk = ticket as any;
  const valid = tk.status === "VALID";
  const variant = STATUS_VARIANT[tk.status] ?? "secondary";

  return (
    <div className="mx-auto w-full max-w-md px-5 py-5">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Link href="/my-tickets" className="flex items-center gap-0.5 text-base hover:opacity-60">
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {t(dict, "ticketdetail.back")}
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold tracking-tight">{tk.ticket_name ?? "Ticket"}</h1>
        <Badge variant={variant}>{statusLabel(dict, tk.status)}</Badge>
      </div>

      <div className="flex flex-col gap-[18px]">
        {/* Entry pass */}
        <div className="rounded-[28px] p-[22px]" style={{ background: "#16170F" }}>
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-[2px] text-muted-foreground">
              {(tk.tier ?? "TICKET").toUpperCase()}
            </span>
            <Badge variant={variant}>{statusLabel(dict, tk.status)}</Badge>
          </div>

          <div className="flex justify-center">
            {valid ? (
              <div className="rounded-3xl bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/tickets/qr?code=${encodeURIComponent(tk.qr_code)}`}
                  alt="Ticket QR"
                  width={210}
                  height={210}
                />
              </div>
            ) : (
              <div className="flex h-56 w-56 flex-col items-center justify-center gap-3 rounded-3xl bg-muted">
                <Ban className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <span className="text-sm text-muted-foreground">{statusLabel(dict, tk.status)}</span>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="mr-3 min-w-0 flex-1">
              <p className="text-[10px] tracking-wider text-muted-foreground">{t(dict, "ticketdetail.ticket")}</p>
              <p className="truncate font-semibold">{tk.ticket_name ?? "Ticket"}</p>
            </div>
            <span className="text-[10px] text-muted-foreground">{t(dict, "ticketdetail.scan_entry")}</span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          {tk.holder_name && <Row label={t(dict, "ticketdetail.name")} value={tk.holder_name} />}
          {tk.holder_email && <Row label={t(dict, "ticketdetail.email")} value={tk.holder_email} />}
          {tk.tier && <Row label={t(dict, "ticketdetail.tier")} value={tk.tier} />}
          <Row label={t(dict, "ticketdetail.issued")} value={formatDate(tk.created_at)} />
          {tk.used_at && <Row label={t(dict, "ticketdetail.used")} value={formatDate(tk.used_at)} />}
          {tk.transferred_to_user_id && (
            <Row label={t(dict, "ticketdetail.transferred")} value={t(dict, "ticketdetail.yes")} />
          )}
          <Separator />
          <p className="truncate font-mono text-xs text-muted-foreground">{tk.qr_code}</p>
        </div>

        {/* Transfer — VALID only */}
        {valid && (
          <TransferTicketButton ticketId={tk.id} ticketName={tk.ticket_name ?? "Ticket"} dict={dict} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
