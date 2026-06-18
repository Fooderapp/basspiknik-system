import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "Bass Piknik <tickets@mail.basspiknik.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://basspiknik.com";

/** Send email + push notifications to all preorder registrants for an event. */
export async function sendOnSaleNotifications(eventId: string, eventName: string, eventSlug: string) {
  const admin = createAdminClient() as any;
  const eventUrl = `${APP_URL}/events/${eventSlug}`;

  // ── Email to preorder registrants ──────────────────────────────────────────
  const { data: preorders } = await admin
    .from("event_preorders")
    .select("id, email, name")
    .eq("event_id", eventId)
    .eq("notified", false);

  if (preorders && preorders.length > 0) {
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <img src="${APP_URL}/logo.svg" alt="Bass Piknik" style="height:40px;margin-bottom:24px" />
        <h1 style="font-size:28px;font-weight:900;color:#16170F;margin:0 0 8px">Tickets on sale! 🎉</h1>
        <p style="color:#555;font-size:16px;margin:0 0 24px">
          <strong>${eventName}</strong> tickets are now available. Grab yours before they sell out.
        </p>
        <a href="${eventUrl}" style="display:inline-block;background:#9FE870;color:#16170F;font-weight:700;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">
          Buy Tickets →
        </a>
        <p style="color:#aaa;font-size:12px;margin-top:32px">
          You registered for a notification about ${eventName}.<br/>
          <a href="${APP_URL}" style="color:#aaa">Bass Piknik</a>
        </p>
      </div>`;

    // Send in batches of 50 (Resend batch limit)
    for (let i = 0; i < preorders.length; i += 50) {
      const batch = preorders.slice(i, i + 50);
      await Promise.allSettled(
        batch.map((p: any) =>
          resend.emails.send({
            from: FROM,
            to: p.email,
            subject: `🎟 ${eventName} — Tickets on sale now!`,
            html,
          })
        )
      );
    }

    // Mark all as notified
    await admin
      .from("event_preorders")
      .update({ notified: true })
      .eq("event_id", eventId);
  }

  // ── Push to all registered devices ────────────────────────────────────────
  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token");

  if (tokens && tokens.length > 0) {
    const messages = tokens.map((t: any) => ({
      to: t.token,
      sound: "default",
      title: "Tickets on sale! 🎟",
      body: `${eventName} tickets are now available — grab yours!`,
      data: { slug: eventSlug, url: eventUrl },
    }));

    // Expo Push API — batches of 100
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      }).catch(() => {});
    }
  }
}
