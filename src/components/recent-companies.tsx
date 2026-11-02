"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Phone, StickyNote } from "lucide-react";
import type { RecentCompany } from "@/lib/queries";
import { ActivityDialog, type ActivityKind } from "./activity-dialog";
import { Empty } from "./ui";

const SHOWN = 10;
const icon = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink";
const tel = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;

function lastLabel(last: Date | null) {
  if (!last) return "";
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
  return days <= 0 ? "heute" : days === 1 ? "gestern" : `vor ${days} Tagen`;
}

// Anrufen: eine Nummer wählt sofort, mehrere zeigen erst die Auswahl, keine einen Hinweis
function CallButton({ company, onCall }: { company: RecentCompany; onCall: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const { numbers } = company;
  if (numbers.length === 1) {
    return (
      <a href={tel(numbers[0].number)} onClick={onCall} aria-label={`${numbers[0].label}: ${numbers[0].number} anrufen`} title={numbers[0].number} className={icon}>
        <Phone size={18} aria-hidden="true" />
      </a>
    );
  }
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={numbers.length ? `${company.name} anrufen` : "Keine Nummer hinterlegt"}
        title={numbers.length ? "Anrufen" : "Keine Nummer hinterlegt"}
        className={`${icon} ${numbers.length ? "" : "opacity-40"}`}
      >
        <Phone size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 flex w-72 flex-col rounded-2xl bg-surface p-1.5 shadow-lg ring-1 ring-line">
          {numbers.length ? (
            numbers.map((n) => (
              <a
                key={n.number}
                href={tel(n.number)}
                onClick={(e) => {
                  // erst wählen, dann das Menü schließen: ein entfernter Link würde nicht mehr wählen
                  e.preventDefault();
                  window.location.href = tel(n.number);
                  setOpen(false);
                  onCall();
                }}
                className="flex flex-col rounded-xl px-3 py-2 hover:bg-bg"
              >
                <span className="text-[13px] text-muted">{n.label}</span>
                <span className="text-sm font-semibold tabular-nums">{n.number}</span>
              </a>
            ))
          ) : (
            <p className="px-3 py-2 text-sm">
              Keine Nummer hinterlegt.{" "}
              <Link href={`/firmen/${company.id}`} className="font-semibold underline">
                Zur Firma
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Startseite: schnell zu den aktiven Kunden, mit Anruf und Schnellnotiz
export function RecentCompanies({ items }: { items: RecentCompany[] }) {
  const [all, setAll] = useState(false);
  const [dialog, setDialog] = useState<{ company: RecentCompany; kind: ActivityKind } | null>(null);
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <>
      {items.length === 0 && <Empty>Keine aktiven Kunden in den letzten 30 Tagen.</Empty>}
      <ul className="flex flex-col">
        {shown.map((c) => (
          <li key={c.id} className="flex items-center gap-2 border-t border-line-soft py-2 pl-5 pr-3">
            <Link href={`/firmen/${c.id}`} className="min-w-0 flex-1 py-1">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <p className="truncate text-[13px] text-muted">
                {[c.contact, c.phone, lastLabel(c.last)].filter(Boolean).join(" · ") || "kein Ansprechpartner"}
              </p>
            </Link>
            <CallButton company={c} onCall={() => setDialog({ company: c, kind: "anruf" })} />
            <button type="button" onClick={() => setDialog({ company: c, kind: "notiz" })} aria-label={`Notiz oder Anruf zu ${c.name} festhalten`} title="Notiz oder Anruf festhalten" className={icon}>
              <StickyNote size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line-soft px-5 py-3 text-left text-[13px] font-semibold text-muted hover:text-ink">
          {all ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}
        </button>
      )}
      {dialog && (
        <ActivityDialog
          companyId={dialog.company.id}
          dealId={null}
          projects={dialog.company.projects}
          title={[dialog.company.name, dialog.company.contact].filter(Boolean).join(" · ")}
          initialKind={dialog.kind}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
