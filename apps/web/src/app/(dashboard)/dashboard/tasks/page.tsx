import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TaskManager } from "@/components/dashboard/task-manager";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Credit Tasks</h1>
        <p className="text-muted-foreground mt-1">
          Define tasks users complete to earn credits. Social tasks are honor-based —
          keep their reward low and use the review queue for high-value ones.
        </p>
      </div>
      <TaskManager />
    </div>
  );
}
