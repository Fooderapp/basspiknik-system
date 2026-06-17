"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

const STORAGE_KEY = "cookie_consent";

export function CookieBanner({ dict }: { dict: Dictionary }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function choose(value: "accepted" | "rejected") {
    localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 z-[60] pointer-events-none" style={{ bottom: "92px" }}>
      <div className="pointer-events-auto mx-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border bg-card shadow-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">{dict["cookie.title"]}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {dict["cookie.notice"]}{" "}
            <Link href="/adatvedelem" className="underline hover:text-foreground transition-colors">
              {dict["cookie.policy_link"]}
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs" onClick={() => choose("accepted")}>
            {dict["cookie.accept"]}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => choose("rejected")}>
            {dict["cookie.reject"]}
          </Button>
        </div>
      </div>
    </div>
  );
}
