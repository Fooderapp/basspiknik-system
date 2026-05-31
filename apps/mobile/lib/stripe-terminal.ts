import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Fetch connection token from our backend
export async function fetchConnectionToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}/api/terminal/connection-token`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Failed to get connection token");
  }

  const { secret } = await res.json();
  return secret;
}

// Hook — wraps Stripe Terminal, adds our connection token fetcher
export function useTerminal() {
  return useStripeTerminal({
    onUpdateDiscoveredReaders: () => {},
  });
}
