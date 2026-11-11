"use client";

import Link from "next/link";
import { useState } from "react";
import { StickyNote } from "lucide-react";
import type { RecentCompany } from "@/lib/queries";
import { ActivityDialog, type ActivityKind } from "./activity-dialog";
import { CallAction } from "./call-menu";
import { Empty } from "./ui";

const SHOWN = 10;
const icon = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink";

function lastLabel(last: Date | null) {
  if (!last) return "";
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
  return days <= 0 ? "heute" : days === 1 ? "gestern" : `vor ${days} Tagen`;
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
            <CallAction target={{ companyId: c.id, title: [c.name, c.contact].filter(Boolean).join(" · "), numbers: c.numbers, people: c.people, projects: c.projects }} className={icon} />
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
          people={dialog.company.people}
          initialPeople={dialog.company.contactPersonId ? [dialog.company.contactPersonId] : []}
          initialKind={dialog.kind}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
