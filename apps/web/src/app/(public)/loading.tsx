import { Loader2 } from "lucide-react";

// Shown automatically during route navigation/data-fetch in the consumer group,
// so a tap gives instant feedback instead of a blank pause.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#163300" }} />
    </div>
  );
}
