import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/events/event-form";
import type { Event } from "@/lib/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient() as any;
  const { data } = await supabase.from("events").select("*").eq("id", id).single();
  if (!data) notFound();
  const event = data as Event;

  // Convert DB format → form format
  const defaultValues = {
    name: event.name,
    description: event.description ?? "",
    coverImageUrl: event.cover_image_url ?? "",
    bannerImageUrl: (event as any).banner_image_url ?? "",
    startDate: event.start_date.slice(0, 16),       // "YYYY-MM-DDTHH:MM"
    endDate: event.end_date ? event.end_date.slice(0, 16) : "",
    venue: event.venue ?? "",
    address: event.address ?? "",
    capacity: event.capacity,
    status: event.status as "DRAFT" | "PUBLISHED",
    taxRate: event.tax_rate,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/events" className="hover:text-foreground transition-colors">Events</Link>
        <span>/</span>
        <Link href={`/dashboard/events/${id}`} className="hover:text-foreground transition-colors">{event.name}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Edit</span>
      </div>
      <h1 className="text-2xl font-bold">Edit Event</h1>
      <EventForm defaultValues={defaultValues} eventId={id} />
    </div>
  );
}
