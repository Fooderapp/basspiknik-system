import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { Profile, Event } from "@/lib/supabase/types";

const createEventSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  bannerImageUrl: z.string().url().optional().nullable(),
  homeCoverImageUrl: z.string().url().optional().nullable(),
  startDate: z.string(),
  endDate: z.string().optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  capacity: z.number().min(1),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  taxRate: z.number().min(0).max(100).default(0),
});

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

export async function GET() {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("events").select("*, ticket_types(*)").order("start_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Event[]);
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile || !["ADMIN", "EDITOR"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, description, coverImageUrl, bannerImageUrl, homeCoverImageUrl, startDate, endDate, venue, address, capacity, status, taxRate } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createAdminClient() as any;
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const { data } = await supabase.from("events").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${baseSlug}-${counter++}`;
  }

  const { data, error } = await supabase.from("events").insert({
    name, slug,
    description: description ?? null,
    cover_image_url: coverImageUrl ?? null,
    banner_image_url: bannerImageUrl ?? null,
    home_cover_image_url: homeCoverImageUrl ?? null,
    start_date: startDate,
    end_date: endDate ?? null,
    venue: venue ?? null,
    address: address ?? null,
    capacity, status,
    tax_rate: taxRate,
    created_by_id: profile.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Event, { status: 201 });
}
