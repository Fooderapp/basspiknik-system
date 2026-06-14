import Link from "next/link";
import type { Dictionary } from "@/lib/i18n";
import { t } from "@/lib/i18n";

/** Public site top bar — Bass Piknik logo + nav. Used on the festival homepage
 *  and artist pages. */
export function SiteHeader({ dict, loggedIn }: { dict: Dictionary; loggedIn: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>
          Bass Piknik
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/events" className="rounded-full px-3 py-2 text-white/90 hover:bg-white/10">{t(dict, "nav.events")}</Link>
          <Link href="/#lineup" className="hidden rounded-full px-3 py-2 text-white/90 hover:bg-white/10 sm:block">{t(dict, "nav.artists")}</Link>
          <Link href="/menu" className="hidden rounded-full px-3 py-2 text-white/90 hover:bg-white/10 sm:block">{t(dict, "nav.bar_menu")}</Link>
          <Link
            href={loggedIn ? "/home" : "/sign-in"}
            className="rounded-full px-4 py-2 font-bold"
            style={{ background: "#9FE870", color: "#0a1305" }}
          >
            {loggedIn ? t(dict, "nav.tickets") : t(dict, "nav.sign_in")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
