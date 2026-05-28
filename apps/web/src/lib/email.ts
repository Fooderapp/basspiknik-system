import nodemailer from "nodemailer";
import QRCode from "qrcode";

// ─── Brevo SMTP transport ──────────────────────────────────────────────────
// BREVO_SMTP_USER = the login shown in Brevo → SMTP & API → SMTP tab (not your email!)
// BREVO_SMTP_KEY  = the SMTP key generated on that same page (NOT the API key)
function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER!,
      pass: process.env.BREVO_SMTP_KEY!,
    },
    tls: { rejectUnauthorized: false },
  });
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(amount);
}

const TIER_COLORS: Record<string, string> = {
  VIP:        "#7c3aed",
  EARLY_BIRD: "#1d4ed8",
  GENERAL:    "#374151",
  LATE:       "#c2410c",
  DOOR:       "#92400e",
  FREE:       "#166534",
};

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

async function generateQRDataURL(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 200,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
}

export async function sendTicketConfirmation(input: SendTicketConfirmationInput) {
  const { to, buyerName, eventName, eventDate, eventVenue, tickets, total, orderId } = input;

  // Generate QR code images for each ticket
  const ticketsWithQR = await Promise.all(
    tickets.map(async (t) => ({
      ...t,
      qrDataUrl: await generateQRDataURL(t.qrCode),
    }))
  );

  const ticketBlocksHtml = ticketsWithQR.map((t, i) => {
    const color = TIER_COLORS[t.tier] ?? "#374151";
    return `
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px;text-align:center;">
        <div style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;padding:4px 12px;border-radius:999px;margin-bottom:12px;text-transform:uppercase;">
          ${t.tier.replace("_", " ")}
        </div>
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:4px;">${t.ticketName}</div>
        ${t.holderName ? `<div style="font-size:13px;color:#6b7280;margin-bottom:12px;">${t.holderName}</div>` : ""}
        <img src="${t.qrDataUrl}" alt="QR Code" width="160" height="160" style="display:block;margin:0 auto 12px;" />
        <div style="font-family:monospace;font-size:11px;color:#9ca3af;letter-spacing:0.05em;">${t.qrCode}</div>
        ${tickets.length > 1 ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">Ticket ${i + 1} of ${tickets.length}</div>` : ""}
      </div>
    `;
  }).join("");

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

          <!-- Tickets -->
          <p style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">Your Tickets</p>
          ${ticketBlocksHtml}

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

  const fromAddress = process.env.BREVO_FROM_EMAIL ?? process.env.BREVO_SMTP_USER!;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `EventOS <${fromAddress}>`,
    to,
    subject: `Your tickets for ${eventName} 🎫`,
    html,
  });
}
