import { Resend } from "resend";
import { generateTicketPdf } from "./ticket-pdf";

// RESEND_API_KEY  = from resend.com → API Keys
// RESEND_FROM     = verified sender, e.g. "EventOS <tickets@mail.basspiknik.com>"

const resend = new Resend(process.env.RESEND_API_KEY);

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(amount);
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
}

export async function sendTicketConfirmation(input: SendTicketConfirmationInput) {
  const { to, buyerName, eventName, eventDate, eventVenue, tickets, total, orderId } = input;

  // Generate PDF with formatted ticket cards
  const pdfBuffer = await generateTicketPdf({
    eventName,
    eventDate,
    eventVenue,
    orderId,
    tickets,
  });

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
          <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Your tickets are confirmed</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#f9fafb;padding:32px;">

          <p style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px;">Hi ${buyerName}!</p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
            You're all set for <strong style="color:#111827;">${eventName}</strong>.
            Your tickets are attached as a PDF — print them or show them on your phone at the entrance.
          </p>

          <!-- Event info -->
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-bottom:8px;">📅 &nbsp;DATE &amp; TIME</td>
                <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-bottom:8px;">${formatEventDate(eventDate)}</td>
              </tr>
              ${eventVenue ? `
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-top:8px;border-top:1px solid #f3f4f6;">📍 &nbsp;VENUE</td>
                <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6;">${eventVenue}</td>
              </tr>` : ""}
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-top:8px;border-top:1px solid #f3f4f6;">🎟 &nbsp;TICKETS</td>
                <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6;">${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#6b7280;padding-top:8px;border-top:1px solid #f3f4f6;">💳 &nbsp;TOTAL PAID</td>
                <td style="font-size:14px;font-weight:800;color:#111827;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6;">${formatCurrency(total)}</td>
              </tr>
            </table>
          </div>

          <!-- PDF notice -->
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;">📎</div>
            <p style="font-size:14px;font-weight:700;color:#1e40af;margin:0 0 4px;">
              ${tickets.length} ticket${tickets.length !== 1 ? "s" : ""} attached as PDF
            </p>
            <p style="font-size:12px;color:#3b82f6;margin:0;">
              Open the attachment · Each ticket has its own QR code
            </p>
          </div>

          <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;line-height:1.6;">
            Show the QR code at the entrance.<br>
            Order ID: <span style="font-family:monospace;">${orderId.slice(0,8).toUpperCase()}</span>
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#e5e7eb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">
            Powered by EventOS · This email was sent to ${to}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const from = process.env.RESEND_FROM ?? "EventOS <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Your tickets for ${eventName} 🎫`,
    html,
    attachments: [
      {
        filename: `tickets-${orderId.slice(0, 8).toUpperCase()}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
