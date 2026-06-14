"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n";
import { t } from "@/lib/i18n";

/** Floating rounded capsule nav — fixed top, logo left, big nav links inside,
 *  green "Menu" pill on the right that opens a fullscreen overlay menu. */
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
    <>
      <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <div
          className={`flex items-center gap-1 rounded-full p-1.5 transition-shadow ${scrolled ? "shadow-[0_8px_28px_rgba(0,0,0,0.35)]" : ""}`}
          style={{ background: "rgba(22,23,15,0.85)", backdropFilter: "blur(14px)" }}
        >
          <Link href="/" className="px-4 text-base font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>
            Bass Piknik
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full px-4 py-2.5 text-base font-bold text-white/90 hover:bg-white/10">
                {l.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full px-5 py-2.5 text-base font-bold"
            style={{ background: "#9FE870", color: "#0a1305" }}
          >
            {t(dict, "nav.menu")}
          </button>
        </div>
      </header>

      {/* Fullscreen overlay menu */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#16170F" }}>
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
            <Link href="/" className="text-lg font-extrabold tracking-tight text-white" onClick={() => setOpen(false)}>
              Bass Piknik
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-5 py-2.5 text-base font-bold"
              style={{ background: "#9FE870", color: "#0a1305" }}
            >
              {t(dict, "nav.close")}
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
    </>
  );
}
