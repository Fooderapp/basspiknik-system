import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { CONFIG_KEYS, getConfigStatus, setConfig } from "@/lib/config";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** GET → masked status of every managed key (admin only). */
export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json({ keys: await getConfigStatus() });
}

const VALID_KEYS = CONFIG_KEYS.map((k) => k.key) as [string, ...string[]];

const schema = z.object({
  updates: z.array(
    z.object({
      key: z.enum(VALID_KEYS),
      // null/"" clears the DB value (falls back to env). undefined = leave as-is.
      value: z.string().nullable(),
    }),
  ),
});

/** POST { updates: [{key, value}] } → upsert config (admin only). */
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    for (const u of parsed.data.updates) {
      await setConfig(u.key, u.value);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, keys: await getConfigStatus() });
}
