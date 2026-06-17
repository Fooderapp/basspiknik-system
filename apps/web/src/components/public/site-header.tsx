"use client";

import type { Dictionary } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import HeaderFramer from "../../../framer/header";
import "../../../framer/styles.css";

/** Floating collapsible pill nav (Framer export). Tap expands it into a
 *  vertical menu with the main site sections. */
export function SiteHeader({ dict, loggedIn }: { dict: Dictionary; loggedIn: boolean }) {
  const labels = {
    menu: t(dict, "nav.menu"),
    close: t(dict, "nav.close_short"),
    items: [
      { label: t(dict, "nav.about"), href: "/#about" },
      { label: t(dict, "nav.events"), href: "/#events" },
      { label: t(dict, "nav.artists"), href: "/#lineup" },
    ],
    cta: {
      label: loggedIn ? t(dict, "nav.dashboard") : t(dict, "nav.sign_in"),
      href: loggedIn ? "/home" : "/sign-in",
    },
  };

  return (
    <header className="fixed inset-x-0 top-4 z-[2] flex justify-center px-4">
      <HeaderFramer labels={labels} />
    </header>
  );
}
