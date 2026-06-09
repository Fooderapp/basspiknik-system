import { Resend } from "resend";
import { generateTicketPdf } from "./ticket-pdf";
import { getDictionary, t } from "./i18n";
import { getConfig } from "./config";
import type { Language, Currency } from "./settings";

// RESEND_API_KEY  = from resend.com → API Keys (admin dashboard or env)
// RESEND_FROM     = verified sender, e.g. "EventOS <tickets@mail.basspiknik.com>"

function formatEventDate(iso: string, lang: Language) {
  const locale = lang === "hu" ? "hu-HU" : "en-US";
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatAmt(amount: number, currency: Currency) {
  const locale = currency === "HUF" ? "hu-HU" : "en-IE";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

interface TicketForEmail {
  id: string;
  qrCode: string;
  ticketName: string;
  tier: string;
  holderName?: string;
}

interface SendTicketConfirmationInput {
  to: string;
  buyerName: string;
  eventName: string;
  eventDate: string;
  eventVenue?: string;
  tickets: TicketForEmail[];
  total: number;
  orderId: string;
  language?: Language;
  currency?: Currency;
}

export async function sendTicketConfirmation(input: SendTicketConfirmationInput) {
  const {
    to, buyerName, eventName, eventDate, eventVenue, tickets, total, orderId,
    language = "hu", currency = "HUF",
  } = input;

  const dict = getDictionary(language);

  // One self-contained PDF per ticket — buyer can forward each to a different person
  const slug = orderId.slice(0, 8).toUpperCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "ticket";

  const attachments = await Promise.all(
    tickets.map(async (tk, i) => {
      const pdfBuffer = await generateTicketPdf({
        eventName,
        eventDate,
        eventVenue,
        orderId,
        tickets: [tk],
        language,
      });
      return {
        filename: `ticket-${slug}-${pad(i + 1)}-${safe(tk.ticketName)}.pdf`,
        content: pdfBuffer,
      };
    })
  );

  const ticketCount = tickets.length;
  const ticketLabel = ticketCount === 1 ? t(dict, "email.ticket_count") : t(dict, "email.ticket_count_pl");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">🎫 EventOS</div>
          <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${t(dict, "email.header_sub")}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#f9fafb;padding:32px;">

          <p style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px;">${t(dict, "email.greeting")} ${buyerName}!</p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
            ${t(dict, "email.confirmed_for")} <strong style="color:#111827;">${eventName}</strong>.
            ${t(dict, "email.pdf_note")}
          </p>

          <!-- Event info -->
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-bottom:8px;">📅 &nbsp;${t(dict, "email.date_time")}</td>
                <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-bottom:8px;">${formatEventDate(eventDate, language)}</td>
              </tr>
              ${eventVenue ? `
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-top:8px;border-top:1px solid #f3f4f6;">📍 &nbsp;${t(dict, "email.venue")}</td>
                <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6;">${eventVenue}</td>
              </tr>` : ""}
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-top:8px;border-top:1px solid #f3f4f6;">🎟 &nbsp;${t(dict, "email.tickets")}</td>
                <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6;">${ticketCount} ${ticketLabel}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-top:8px;border-top:1px solid #f3f4f6;">💳 &nbsp;${t(dict, "email.total_paid")}</td>
                <td style="font-size:14px;font-weight:800;color:#111827;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6;">${formatAmt(total, currency)}</td>
              </tr>
            </table>
          </div>

          <!-- PDF notice -->
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;">📎</div>
            <p style="font-size:14px;font-weight:700;color:#1e40af;margin:0 0 4px;">
              ${ticketCount} ${t(dict, "email.pdf_label")}
            </p>
            <p style="font-size:12px;color:#3b82f6;margin:0;">
              ${t(dict, "email.pdf_sub")}
            </p>
          </div>

          <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;line-height:1.6;">
            ${t(dict, "email.show_qr")}<br>
            ${t(dict, "email.order_id")}: <span style="font-family:monospace;">${orderId.slice(0,8).toUpperCase()}</span>
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#e5e7eb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">
            ${t(dict, "email.footer")} ${to}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const apiKey = await getConfig("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured (admin → settings or env).");
  const resend = new Resend(apiKey);
  const from = (await getConfig("RESEND_FROM")) ?? "EventOS <onboarding@resend.dev>";
  const subject = language === "hu"
    ? `${t(dict, "email.subject")} ${eventName} ${t(dict, "email.subject_suffix")}`
    : `${t(dict, "email.subject")} ${eventName} ${t(dict, "email.subject_suffix")}`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    attachments,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
