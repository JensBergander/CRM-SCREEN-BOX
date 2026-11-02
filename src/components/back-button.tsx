"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const KEY = "crm-inapp";

// Merkt sich pro Tab, ob schon innerhalb des CRM navigiert wurde. Ohne das führt „Zurück“
// z. B. nach einem Link aus der Montags-Mail aus dem CRM heraus.
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const first = sessionStorage.getItem(`${KEY}-first`);
      if (first === null) sessionStorage.setItem(`${KEY}-first`, pathname);
      else if (first !== pathname) sessionStorage.setItem(KEY, "1");
    } catch {
      // ohne sessionStorage führt „Zurück“ immer zur Übersicht
    }
  }, [pathname]);
  return null;
}

// Wie die Zurück-Taste des Browsers; ohne Verlauf im CRM zur passenden Übersicht
export function BackButton({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        let inApp = false;
        try {
          inApp = sessionStorage.getItem(KEY) === "1";
        } catch {}
        if (inApp && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="-mb-3 inline-flex min-h-9 items-center gap-1.5 self-start rounded-full pr-3 text-[13px] font-semibold text-muted hover:text-ink"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Zurück <span className="sr-only">zu {label}</span>
    </button>
  );
}
