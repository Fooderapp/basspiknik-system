import { redirect } from "next/navigation";
import { EventForm } from "@/components/events/event-form";
import { getCurrentProfile } from "@/lib/auth";

export default async function NewEventPage() {
  const profile = await getCurrentProfile();
  if (!["ADMIN", "EDITOR"].includes(profile?.role ?? "")) redirect("/dashboard");

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Create Event</h1>
        <p className="text-muted-foreground">Fill in the details for your new event.</p>
      </div>
      <EventForm />
    </div>
  );
}
