"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Mail, Phone } from "lucide-react";
import type { CallTarget, MailAddress, PhoneNumber } from "@/lib/queries";
import { ActivityDialog } from "./activity-dialog";

export const telHref = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;

// Wählen über das System (iPhone direkt, am Mac mit Auswahl iPhone/FaceTime)
export function dial(number: string) {
  window.location.href = telHref(number);
}

const MENU_WIDTH = 288;

// Schwebt fest über der Seite, damit Tabellen mit eigenem Scrollbereich das Menü nicht abschneiden.
// Öffnet unter dem Knopf, bei zu wenig Platz darüber; schließt bei Klick daneben, Escape oder Scrollen.
function Floating({ anchor, onClose, children }: { anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const h = box.current?.offsetHeight ?? 0;
    if (!a) return;
    const below = a.bottom + 6;
    const top = below + h > window.innerHeight - 8 && a.top - 6 - h > 8 ? a.top - 6 - h : below;
    const left = Math.max(8, Math.min(a.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const scroll = (e: Event) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={box}
      role="menu"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: MENU_WIDTH, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-50 flex max-h-[60vh] flex-col overflow-y-auto rounded-2xl bg-surface p-1.5 text-left text-ink shadow-lg ring-1 ring-line"
    >
      {children}
    </div>
  );
}

type Choice = { key: string; label: string; value: string; own?: boolean };

// Auswahlliste; die Einträge der angeklickten Person stehen abgetrennt oben
function Choices({ items, onPick }: { items: Choice[]; onPick: (c: Choice) => void }) {
  return items.map((c, i) => (
    <Fragment key={c.key}>
      {i > 0 && items[i - 1].own && !c.own && <hr className="mx-3 my-1 border-line-soft" />}
      <button type="button" role="menuitem" onClick={() => onPick(c)} className="flex flex-col rounded-xl px-3 py-2 text-left hover:bg-bg">
        <span className="truncate text-[13px] text-muted">{c.label}</span>
        <span className="truncate text-sm font-semibold tabular-nums">{c.value}</span>
      </button>
    </Fragment>
  ));
}

const phoneChoices = (numbers: PhoneNumber[]): Choice[] => numbers.map((n) => ({ key: n.number, label: n.label, value: n.number, own: n.own }));
const mailChoices = (emails: MailAddress[]): Choice[] => emails.map((m) => ({ key: m.email, label: m.label, value: m.email, own: m.own }));

// Für „Anruf“ im Notizformular: Nummernauswahl unter dem Knopf
export function NumberMenu({ anchor, numbers, onPick, onClose }: { anchor: RefObject<HTMLElement | null>; numbers: PhoneNumber[]; onPick: (n: PhoneNumber) => void; onClose: () => void }) {
  return (
    <Floating anchor={anchor} onClose={onClose}>
      <Choices items={phoneChoices(numbers)} onPick={(c) => onPick(numbers.find((n) => n.number === c.value)!)} />
    </Floating>
  );
}

// Direkt ausführen nur, wenn es genau einen Eintrag gibt und der zur angeklickten Person gehört.
// Bei einer Firma steht immer die Liste da, damit man sieht, wen man erreicht.
const direct = (items: { own?: boolean }[]) => items.length === 1 && !!items[0].own;

function Missing({ text, companyId }: { text: string; companyId: number | null }) {
  return (
    <p className="px-3 py-2 text-sm">
      {text}{" "}
      {companyId && (
        <Link href={`/firmen/${companyId}`} className="font-semibold underline">
          Zur Firma
        </Link>
      )}
    </p>
  );
}

// 📞 überall gleich: Liste der Nummern (Person oben), keine Nummer zeigt einen Hinweis.
// Nach dem Wählen öffnet sich „Anruf festhalten“.
export function CallAction({ target, className }: { target: CallTarget; className: string }) {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);
  const button = useRef<HTMLElement>(null);
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

  if (direct(numbers)) {
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
    <>
      <button
        ref={button as RefObject<HTMLButtonElement>}
        type="button"
        onClick={() => setMenu(!menu)}
        aria-expanded={menu}
        aria-haspopup="menu"
        aria-label={numbers.length ? `${who} anrufen` : "Keine Nummer hinterlegt"}
        title={numbers.length ? "Anrufen" : "Keine Nummer hinterlegt"}
        className={`${className} ${numbers.length ? "" : "opacity-40"}`}
      >
        <Phone size={16} aria-hidden="true" />
      </button>
      {menu && (
        <Floating anchor={button} onClose={close}>
          {numbers.length ? (
            <Choices
              items={phoneChoices(numbers)}
              onPick={(c) => {
                dial(c.value);
                setMenu(false);
                setDialog(true);
              }}
            />
          ) : (
            <Missing text="Keine Nummer hinterlegt." companyId={target.companyId} />
          )}
        </Floating>
      )}
      {popup}
    </>
  );
}

// ✉︎ nach demselben Muster: Liste der Adressen von Ansprechpartnern und Firma, öffnet das Mailprogramm
export function MailAction({ target, className }: { target: CallTarget; className: string }) {
  const [menu, setMenu] = useState(false);
  const button = useRef<HTMLElement>(null);
  const close = useCallback(() => setMenu(false), []);
  const emails = target.emails ?? [];
  const who = target.person ?? target.title;

  if (direct(emails)) {
    return (
      <a href={`mailto:${emails[0].email}`} aria-label={`Mail an ${who}: ${emails[0].email}`} title={emails[0].email} className={className}>
        <Mail size={16} aria-hidden="true" />
      </a>
    );
  }
  return (
    <>
      <button
        ref={button as RefObject<HTMLButtonElement>}
        type="button"
        onClick={() => setMenu(!menu)}
        aria-expanded={menu}
        aria-haspopup="menu"
        aria-label={emails.length ? `Mail an ${who}` : "Keine Mail-Adresse hinterlegt"}
        title={emails.length ? "Mail schreiben" : "Keine Mail-Adresse hinterlegt"}
        className={`${className} ${emails.length ? "" : "opacity-40"}`}
      >
        <Mail size={16} aria-hidden="true" />
      </button>
      {menu && (
        <Floating anchor={button} onClose={close}>
          {emails.length ? (
            <Choices
              items={mailChoices(emails)}
              onPick={(c) => {
                window.location.href = `mailto:${c.value}`;
                setMenu(false);
              }}
            />
          ) : (
            <Missing text="Keine Mail-Adresse hinterlegt." companyId={target.companyId} />
          )}
        </Floating>
      )}
    </>
  );
}
