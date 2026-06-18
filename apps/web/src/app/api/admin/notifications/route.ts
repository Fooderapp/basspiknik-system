import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Resend } from "resend";

/* eslint-disable @typescript-eslint/no-explicit-any */

const schema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  channels: z.array(z.enum(["email", "push"])).min(1),
  audience: z.enum(["all_push", "event_preorders"]),
  eventId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { subject, body, channels, audience, eventId } = parsed.data;
  const admin = createAdminClient() as any;

  let emailsSent = 0;
  let pushSent = 0;

  // ── Email channel ──────────────────────────────────────────────────────────
  if (channels.includes("email")) {
    let emails: string[] = [];

    if (audience === "event_preorders" && eventId) {
      const { data } = await admin
        .from("event_preorders")
        .select("email")
        .eq("event_id", eventId);
      emails = (data ?? []).map((r: any) => r.email as string);
    } else {
      // All profiles with an email
      const { data } = await admin.from("profiles").select("email");
      emails = (data ?? []).map((r: any) => r.email as string).filter(Boolean);
    }

    if (emails.length > 0 && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM ?? "EventOS <noreply@mail.basspiknik.com>";
      // Batch in chunks of 50
      for (let i = 0; i < emails.length; i += 50) {
        const batch = emails.slice(i, i + 50);
        await Promise.allSettled(
          batch.map((to) =>
            resend.emails.send({
              from,
              to,
              subject,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
                <h2 style="margin:0 0 16px">${subject}</h2>
                <p style="white-space:pre-wrap;color:#444;line-height:1.6">${body}</p>
              </div>`,
            })
          )
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
      // Batch in chunks of 100 (Expo limit)
      for (let i = 0; i < pushTokens.length; i += 100) {
        const batch = pushTokens.slice(i, i + 100);
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            batch.map((token) => ({ to: token, title: subject, body, sound: "default" }))
          ),
        }).catch(() => {});
        pushSent += batch.length;
      }
    }
  }

  return NextResponse.json({ ok: true, emailsSent, pushSent });
}
