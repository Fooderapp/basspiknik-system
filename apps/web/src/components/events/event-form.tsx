"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CoverImageUploader } from "@/components/events/cover-image-uploader";
import { BannerImageUploader } from "@/components/events/banner-image-uploader";

const eventSchema = z.object({
  name: z.string().min(2, "Name too short"),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  bannerImageUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  capacity: z.coerce.number().min(1, "Capacity must be at least 1"),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormProps {
  defaultValues?: Partial<EventFormData & { coverImageUrl?: string | null }>;
  eventId?: string;
}

export function EventForm({ defaultValues, eventId }: EventFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      status: "DRAFT",
      taxRate: 0,
      capacity: 100,
      ...defaultValues,
    },
  });

  const onSubmit = async (data: EventFormData) => {
    try {
      const payload = {
        ...data,
        coverImageUrl: data.coverImageUrl || null,
        bannerImageUrl: data.bannerImageUrl || null,
      };
      const res = await fetch(eventId ? `/api/events/${eventId}` : "/api/events", {
        method: eventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save event");
      }

      const event = await res.json();
      toast.success(eventId ? "Event updated!" : "Event created!");
      router.push(`/dashboard/events/${event.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Event Name *</Label>
            <Input id="name" placeholder="Summer Festival 2026" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} placeholder="Describe your event..." {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label>Cover Image</Label>
            <CoverImageUploader
              value={watch("coverImageUrl") ?? undefined}
              onChange={(url) => setValue("coverImageUrl", url ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              Auto-resized to 1920×1080. Mobile shows a centre-cropped 1080×1080 square.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Ticket Banner (4:1)</Label>
            <BannerImageUploader
              value={watch("bannerImageUrl") ?? undefined}
              onChange={(url) => setValue("bannerImageUrl", url ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              480×120 artwork shown on ticket cards and the ticket PDF header.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date & Time *</Label>
              <Input id="startDate" type="datetime-local" {...register("startDate")} />
              {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date & Time</Label>
              <Input id="endDate" type="datetime-local" {...register("endDate")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="venue">Venue Name</Label>
              <Input id="venue" placeholder="The Grand Hall" {...register("venue")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Total Capacity *</Label>
              <Input id="capacity" type="number" min={1} {...register("capacity")} />
              {errors.capacity && <p className="text-sm text-destructive">{errors.capacity.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="123 Main St, City, Country" {...register("address")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                defaultValue={watch("status")}
                onValueChange={(v) => setValue("status", v as "DRAFT" | "PUBLISHED")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxRate">Tax Rate (%)</Label>
              <Input id="taxRate" type="number" min={0} max={100} step={0.01} {...register("taxRate")} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : eventId ? "Update Event" : "Create Event"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
