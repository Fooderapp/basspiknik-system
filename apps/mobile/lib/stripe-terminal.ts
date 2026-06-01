import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Fetch connection token from our backend
export async function fetchConnectionToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated — sign in first");

  const res = await fetch(`${API_URL}/api/terminal/connection-token`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  if (!text) throw new Error("Empty response from connection token endpoint");

  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON response: ${text.slice(0, 100)}`); }

  if (!res.ok) throw new Error(json.error ?? "Failed to get connection token");
  if (!json.secret) throw new Error("No secret in connection token response");
  return json.secret;
}

// Hook — wraps Stripe Terminal, adds our connection token fetcher
export function useTerminal() {
  return useStripeTerminal({
    onUpdateDiscoveredReaders: () => {},
  });
}
