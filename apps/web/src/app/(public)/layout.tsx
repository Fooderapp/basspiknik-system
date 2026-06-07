import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n";
import { ConsumerShell } from "@/components/consumer/consumer-shell";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const dict = getDictionary(settings.language);

  return <ConsumerShell dict={dict}>{children}</ConsumerShell>;
}
