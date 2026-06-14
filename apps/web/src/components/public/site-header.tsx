"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n";
import { t } from "@/lib/i18n";

/** Floating rounded capsule nav — fixed top, logo left, green "Menu" pill on
 *  the right. Capped at 400px on desktop, full-width on mobile. Opening the
 *  menu animates a rounded dropdown panel below the capsule (no fullscreen
 *  takeover). */
export function SiteHeader({ dict, loggedIn }: { dict: Dictionary; loggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "/events", label: t(dict, "nav.events") },
    { href: "/#lineup", label: t(dict, "nav.artists") },
    { href: "/menu", label: t(dict, "nav.bar_menu") },
  ];

  return (
    <header className="fixed inset-x-0 top-4 z-40 px-4 sm:flex sm:justify-center">
      <div className="relative w-full sm:mx-auto sm:max-w-[400px]">
        {/* Capsule bar */}
        <div
          className={`relative z-10 flex items-center justify-between rounded-full p-1.5 transition-shadow ${scrolled ? "shadow-[0_8px_28px_rgba(0,0,0,0.35)]" : ""}`}
          style={{ background: "rgba(22,23,15,0.85)", backdropFilter: "blur(14px)" }}
        >
          <Link href="/" className="px-4 text-base font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>
            Bass Piknik
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-full px-5 py-2.5 text-base font-bold"
            style={{ background: "#9FE870", color: "#0a1305" }}
          >
            {open ? t(dict, "nav.close") : t(dict, "nav.menu")}
          </button>
        </div>

        {/* Animated dropdown panel */}
        <div
          className={`absolute inset-x-0 top-full z-0 mt-2 origin-top overflow-hidden rounded-3xl p-2 shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-all duration-300 ease-out ${
            open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-90 opacity-0"
          }`}
          style={{ background: "rgba(22,23,15,0.96)", backdropFilter: "blur(14px)" }}
        >
          <nav className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-2xl px-4 py-3 text-base font-bold text-white/90 hover:bg-white/10"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={loggedIn ? "/home" : "/sign-in"}
              onClick={() => setOpen(false)}
              className="mt-1 rounded-2xl px-4 py-3 text-center text-base font-bold"
              style={{ background: "#9FE870", color: "#0a1305" }}
            >
              {loggedIn ? t(dict, "nav.tickets") : t(dict, "nav.sign_in")}
            </Link>
          </nav>
        </div>

        {/* Click-outside backdrop */}
        {open && (
          <button
            type="button"
            aria-label={t(dict, "nav.close")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 -z-10 cursor-default"
          />
        )}
      </div>
    </header>
  );
}
