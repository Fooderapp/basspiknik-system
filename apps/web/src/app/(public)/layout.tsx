import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { ConsumerShell } from "@/components/consumer/consumer-shell";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const dict = getDictionary(settings.language);
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();

  return <ConsumerShell dict={dict} loggedIn={!!user}>{children}</ConsumerShell>;
}
