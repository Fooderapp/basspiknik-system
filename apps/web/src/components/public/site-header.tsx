"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { t } from "@/lib/i18n";

/** Public site top bar — Bass Piknik logo + nav. Transparent over the hero,
 *  gains a dark blurred background once the page scrolls. Collapses into a
 *  fullscreen mobile menu below the `sm` breakpoint. */
export function SiteHeader({ dict, loggedIn }: { dict: Dictionary; loggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const links = [
    { href: "/events", label: t(dict, "nav.events") },
    { href: "/#lineup", label: t(dict, "nav.artists") },
    { href: "/menu", label: t(dict, "nav.bar_menu") },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-9 z-30 transition-colors duration-300 ${
        scrolled ? "backdrop-blur-md" : ""
      }`}
      style={{ background: scrolled ? "rgba(22,23,15,0.85)" : "transparent" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>
          Bass Piknik
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-semibold sm:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-white/90 hover:bg-white/10">{l.label}</Link>
          ))}
          <Link
            href={loggedIn ? "/home" : "/sign-in"}
            className="rounded-full px-4 py-2 font-bold"
            style={{ background: "#9FE870", color: "#0a1305" }}
          >
            {loggedIn ? t(dict, "nav.tickets") : t(dict, "nav.sign_in")}
          </Link>
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t(dict, "nav.menu")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white sm:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Fullscreen mobile menu */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#16170F" }}>
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
            <Link href="/" className="text-lg font-extrabold tracking-tight text-white" onClick={() => setOpen(false)}>
              Bass Piknik
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t(dict, "nav.close")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col items-center justify-center gap-6">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-3xl font-extrabold tracking-tight text-white">
                {l.label}
              </Link>
            ))}
            <Link
              href={loggedIn ? "/home" : "/sign-in"}
              onClick={() => setOpen(false)}
              className="mt-4 rounded-full px-8 py-3.5 text-lg font-bold"
              style={{ background: "#9FE870", color: "#0a1305" }}
            >
              {loggedIn ? t(dict, "nav.tickets") : t(dict, "nav.sign_in")}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
