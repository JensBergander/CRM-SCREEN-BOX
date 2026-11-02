"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import type { CallTarget, PhoneNumber } from "@/lib/queries";
import { ActivityDialog } from "./activity-dialog";

export const telHref = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;

// Wählen über das System (iPhone direkt, am Mac mit Auswahl iPhone/FaceTime)
export function dial(number: string) {
  window.location.href = telHref(number);
}

// Auswahl, wenn es mehrere Nummern gibt; die der angeklickten Person stehen abgetrennt oben
export function NumberMenu({ numbers, onPick, onClose }: { numbers: PhoneNumber[]; onPick: (n: PhoneNumber) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  return (
    <div ref={box} role="menu" className="absolute right-0 top-11 z-20 flex w-72 flex-col rounded-2xl bg-surface p-1.5 text-left shadow-lg ring-1 ring-line">
      {numbers.map((n, i) => (
        <Fragment key={n.number}>
          {i > 0 && numbers[i - 1].own && !n.own && <hr className="mx-3 my-1 border-line-soft" />}
          <button type="button" role="menuitem" onClick={() => onPick(n)} className="flex flex-col rounded-xl px-3 py-2 text-left hover:bg-bg">
            <span className="text-[13px] text-muted">{n.label}</span>
            <span className="text-sm font-semibold tabular-nums">{n.number}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

// 📞 überall gleich: eine Nummer wählt sofort, mehrere zeigen die Auswahl, keine einen Hinweis.
// Nach dem Wählen öffnet sich „Anruf festhalten“.
export function CallAction({ target, className }: { target: CallTarget; className: string }) {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const { numbers } = target;
  const who = target.person ?? target.title;

  const popup = dialog && (
    <ActivityDialog
      companyId={target.companyId}
      dealId={null}
      projects={target.projects}
      title={target.title}
      person={target.person}
      initialKind="anruf"
      onClose={() => setDialog(false)}
    />
  );

  if (numbers.length === 1) {
    return (
      <>
        <a href={telHref(numbers[0].number)} onClick={() => setDialog(true)} aria-label={`${who} anrufen: ${numbers[0].number}`} title={numbers[0].number} className={className}>
          <Phone size={16} aria-hidden="true" />
        </a>
        {popup}
      </>
    );
  }
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setMenu(!menu)}
        aria-expanded={menu}
        aria-label={numbers.length ? `${who} anrufen` : "Keine Nummer hinterlegt"}
        title={numbers.length ? "Anrufen" : "Keine Nummer hinterlegt"}
        className={`${className} ${numbers.length ? "" : "opacity-40"}`}
      >
        <Phone size={16} aria-hidden="true" />
      </button>
      {menu && numbers.length > 0 && (
        <NumberMenu
          numbers={numbers}
          onClose={close}
          onPick={(n) => {
            dial(n.number);
            setMenu(false);
            setDialog(true);
          }}
        />
      )}
      {menu && !numbers.length && (
        <span className="absolute right-0 top-11 z-20 w-64 rounded-2xl bg-surface px-4 py-3 text-left text-sm font-normal shadow-lg ring-1 ring-line">
          Keine Nummer hinterlegt.{" "}
          {target.companyId && (
            <Link href={`/firmen/${target.companyId}`} className="font-semibold underline">
              Zur Firma
            </Link>
          )}
        </span>
      )}
      {popup}
    </span>
  );
}
