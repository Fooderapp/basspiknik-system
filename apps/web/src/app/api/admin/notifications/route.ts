import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Resend } from "resend";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  subject:  z.string().min(1).max(200),
  body:     z.string().min(1).max(2000),
  ctaText:  z.string().max(100).optional(),
  ctaUrl:   z.string().url().optional().or(z.literal("")),
  channels: z.array(z.enum(["email", "push"])).min(1),
  audience: z.enum(["all_push", "event_preorders"]),
  eventId:  z.string().uuid().optional(),
});

const FROM = process.env.RESEND_FROM ?? "Bass Piknik <tickets@mail.basspiknik.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://basspiknik.com";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { subject, body, ctaText, ctaUrl, channels, audience, eventId } = parsed.data;
  const admin = createAdminClient() as any;

  let emailsSent = 0;
  let pushSent = 0;

  // ── Email channel ──────────────────────────────────────────────────────────
  if (channels.includes("email")) {
    let emails: string[] = [];

    if (audience === "event_preorders" && eventId) {
      const { data } = await admin.from("event_preorders").select("email").eq("event_id", eventId);
      emails = (data ?? []).map((r: any) => r.email as string);
    } else {
      const { data } = await admin.from("profiles").select("email");
      emails = (data ?? []).map((r: any) => r.email as string).filter(Boolean);
    }

    if (emails.length > 0 && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const ctaBlock = ctaText && ctaUrl
        ? `<a href="${ctaUrl}" style="display:inline-block;background:#9FE870;color:#16170F;font-weight:700;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none;margin-top:24px">${ctaText}</a>`
        : "";

      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
          <img src="${APP_URL}/logo.svg" alt="Bass Piknik" style="height:40px;margin-bottom:24px" />
          <h1 style="font-size:24px;font-weight:900;color:#16170F;margin:0 0 12px">${subject}</h1>
          <p style="color:#555;font-size:16px;line-height:1.7;white-space:pre-wrap;margin:0 0 8px">${body}</p>
          ${ctaBlock}
          <p style="color:#aaa;font-size:12px;margin-top:40px">
            <a href="${APP_URL}" style="color:#aaa">Bass Piknik</a>
          </p>
        </div>`;

      for (let i = 0; i < emails.length; i += 50) {
        const batch = emails.slice(i, i + 50);
        await Promise.allSettled(
          batch.map((to) => resend.emails.send({ from: FROM, to, subject, html }))
        );
        emailsSent += batch.length;
      }
    }
  }

  // ── Push channel ───────────────────────────────────────────────────────────
  if (channels.includes("push")) {
    const { data: tokens } = await admin.from("push_tokens").select("token");
    const pushTokens: string[] = (tokens ?? []).map((r: any) => r.token as string);

    if (pushTokens.length > 0) {
      for (let i = 0; i < pushTokens.length; i += 100) {
        const batch = pushTokens.slice(i, i + 100);
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            batch.map((token) => ({
              to: token,
              title: subject,
              body,
              sound: "default",
              // url is picked up by Expo Router for deeplink navigation on tap
              ...(ctaUrl ? { data: { url: ctaUrl } } : {}),
            }))
          ),
        }).catch(() => {});
        pushSent += batch.length;
      }
    }
  }

  return NextResponse.json({ ok: true, emailsSent, pushSent });
}
