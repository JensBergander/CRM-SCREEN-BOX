"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso, dateDe, todayIso } from "@/lib/format";

// Eigene Datumswahl statt <input type="date">: Safari ließ die große Kalenderansicht offen.
// Wert intern immer YYYY-MM-DD; angezeigt wird „Fr, 27.11.2026“.

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
// 0 = Sonntag
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toIso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

const clamp = (iso: string, min?: string, max?: string) => (min && iso < min ? min : max && iso > max ? max : iso);

export function formatDateDe(iso: string) {
  return isIso(iso) ? `${WEEKDAYS[weekdayOf(iso)]}, ${dateDe(iso)}` : "";
}

const longLabel = (iso: string) => {
  const [y, m, d] = parts(iso);
  return `${WEEKDAYS_LONG[weekdayOf(iso)]}, ${d}. ${MONTHS[m - 1]} ${y}`;
};

// Eingetipptes Datum lesen: 27.11.2026, 27.11.26, 27.11., 2711, 271126, 27112026, 2026-11-27, „Fr, 27.11.2026“.
// Ohne Jahr: aktuelles Jahr, liegt das vor dem frühesten erlaubten Tag, das nächste.
// Gibt "" für leer, null für unlesbar zurück.
export function parseDateDe(input: string, today = todayIso(), min?: string): string | null {
  const s = input.trim().replace(/^[a-zäöü]+\.?,?\s*(?=\d)/i, "").replace(/\.$/, "");
  if (!s) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let d: number, m: number, y: number | undefined;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const sep = /^(\d{1,2})[.\-/, ]+(\d{1,2})(?:[.\-/, ]+(\d{2}|\d{4}))?$/.exec(s);
    if (sep) {
      [d, m] = [Number(sep[1]), Number(sep[2])];
      if (sep[3]) y = Number(sep[3]);
    } else if (/^\d+$/.test(s) && [4, 6, 8].includes(s.length)) {
      [d, m] = [Number(s.slice(0, 2)), Number(s.slice(2, 4))];
      if (s.length > 4) y = Number(s.slice(4));
    } else if (/^\d{1,2}$/.test(s)) {
      // nur der Tag: im laufenden Monat
      [, m] = parts(today);
      d = Number(s);
    } else {
      return null;
    }
  }
  const [ty] = parts(today);
  if (y !== undefined && y < 100) y += 2000;
  const withYear = (year: number) => (m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(year, m) ? toIso(year, m, d) : null);
  if (y !== undefined) return withYear(y);
  const thisYear = withYear(ty);
  if (thisYear && min && thisYear < min) return withYear(ty + 1) ?? thisYear;
  return thisYear;
}

// --- Monatsansicht ---------------------------------------------------------

export function Calendar({ value, min, max, onSelect, autoFocus = false }: {
  value?: string;
  min?: string;
  max?: string;
  onSelect: (iso: string) => void;
  autoFocus?: boolean;
}) {
  const today = todayIso();
  const [focusDay, setFocusDay] = useState(() => clamp(isIso(value) ? value : today, min, max));
  const grid = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(autoFocus);
  const titleId = useId();

  useEffect(() => {
    if (!moveFocus.current) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusDay}"]`)?.focus();
  }, [focusDay]);

  const [y, m] = parts(focusDay);
  const first = toIso(y, m, 1);
  // Montag als Wochenstart, immer sechs Wochen, damit das Feld nicht springt
  const start = addDaysIso(first, -((weekdayOf(first) + 6) % 7));
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDaysIso(start, w * 7 + i)));
  const disabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  const go = (iso: string, keyboard: boolean) => {
    moveFocus.current = keyboard;
    setFocusDay(iso);
  };
  const pick = (iso: string) => !disabled(iso) && onSelect(iso);

  const onKey = (e: ReactKeyboardEvent) => {
    const wd = (weekdayOf(focusDay) + 6) % 7;
    const next: Record<string, string> = {
      ArrowLeft: addDaysIso(focusDay, -1),
      ArrowRight: addDaysIso(focusDay, 1),
      ArrowUp: addDaysIso(focusDay, -7),
      ArrowDown: addDaysIso(focusDay, 7),
      Home: addDaysIso(focusDay, -wd),
      End: addDaysIso(focusDay, 6 - wd),
      PageUp: addMonthsIso(focusDay, e.shiftKey ? -12 : -1),
      PageDown: addMonthsIso(focusDay, e.shiftKey ? 12 : 1),
    };
    if (next[e.key]) {
      e.preventDefault();
      go(next[e.key], true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focusDay);
    }
  };

  const nav = "flex h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink";
  const cell = "h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={() => go(addMonthsIso(focusDay, -1), false)} aria-label="Vorheriger Monat" className={nav}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span id={titleId} aria-live="polite" className="text-sm font-semibold">{MONTHS[m - 1]} {y}</span>
        <button type="button" onClick={() => go(addMonthsIso(focusDay, 1), false)} aria-label="Nächster Monat" className={nav}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <table ref={grid} role="grid" aria-labelledby={titleId} className="border-collapse" onKeyDown={onKey}>
        <thead>
          <tr>
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <th key={wd} scope="col" abbr={WEEKDAYS_LONG[wd]} className="h-7 text-center text-[11px] font-semibold text-muted">
                {WEEKDAYS[wd]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((iso) => {
                const selected = iso === value;
                const off = disabled(iso);
                const other = parts(iso)[1] !== m;
                const isToday = iso === today;
                return (
                  <td key={iso} role="gridcell" aria-selected={selected} className="p-0 text-center">
                    <button
                      type="button"
                      data-iso={iso}
                      tabIndex={iso === focusDay ? 0 : -1}
                      aria-label={`${longLabel(iso)}${isToday ? ", heute" : ""}`}
                      aria-current={isToday ? "date" : undefined}
                      aria-disabled={off || undefined}
                      onClick={() => pick(iso)}
                      className={`${cell} rounded-full text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                        selected
                          ? "bg-ink font-semibold text-surface"
                          : off
                            ? "cursor-default text-muted/40 line-through decoration-muted/40"
                            : `${other ? "text-muted" : "text-ink"} hover:bg-bg ${isToday ? "font-bold ring-1 ring-inset ring-ink" : ""}`
                      }`}
                    >
                      {parts(iso)[2]}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-1.5">
        <button
          type="button"
          onClick={() => (disabled(today) ? go(today, false) : onSelect(today))}
          className="inline-flex min-h-9 pointer-coarse:min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-ink hover:bg-bg"
        >
          Heute
        </button>
        <span className="pr-2 text-xs text-muted">{dateDe(today)}</span>
      </div>
    </div>
  );
}

// --- Feld mit Popover ------------------------------------------------------

const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useCoarsePointer = () =>
  useSyncExternalStore(subscribeCoarse, () => window.matchMedia("(pointer: coarse)").matches, () => false);

function position(anchor: HTMLElement | null, box: HTMLElement | null) {
  const a = anchor?.getBoundingClientRect();
  if (!a || !box) return null;
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;
  const vw = vv?.width ?? window.innerWidth;
  const h = box.offsetHeight;
  const w = box.offsetWidth;
  const below = a.bottom + 6;
  const top = below + h > vh - 8 && a.top - 6 - h > 8 ? a.top - 6 - h : Math.max(8, Math.min(below, vh - h - 8));
  return { top, left: Math.max(8, Math.min(a.left, vw - w - 8)) };
}

// Schwebt fest über der Seite (Portal), damit Fenster mit overflow-auto es nicht abschneiden.
// Öffnet unter dem Feld, bei zu wenig Platz darüber; folgt beim Scrollen.
function Popover({ anchor, onClose, children }: { anchor: React.RefObject<HTMLElement | null>; onClose: (refocus: boolean) => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => setPos(position(anchor.current, box.current)), [anchor]);

  useEffect(() => {
    const place = () => setPos(position(anchor.current, box.current));
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node) && onClose(false);
    // Capture: Escape schließt nur den Kalender, nicht das Fenster darunter
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose(true);
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="Datum wählen"
      // Klicks im Kalender nehmen dem Feld nicht den Fokus (Safari fokussiert Knöpfe beim Klick nicht)
      onMouseDown={(e) => e.preventDefault()}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !box.current?.contains(to) && !anchor.current?.contains(to)) onClose(false);
      }}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-[70] rounded-2xl bg-surface p-2 text-ink shadow-lg ring-1 ring-line"
    >
      {children}
    </div>,
    document.body,
  );
}

type DateInputProps = {
  /** kontrolliert: ISO-Datum oder "" */
  value?: string;
  /** unkontrolliert (Formulare mit name) */
  defaultValue?: string;
  onChange?: (iso: string) => void;
  /** schickt den ISO-Wert über ein verstecktes Feld mit */
  name?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  /** volle Breite statt kompakt */
  full?: boolean;
  /** kleine, runde Variante (z. B. neben Chips) */
  small?: boolean;
  className?: string;
};

export function DateInput({ value, defaultValue, onChange, name, min, max, required, disabled, autoFocus, id, full, small, className = "", ...rest }: DateInputProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = controlled ? value : inner;
  // Eingetippter Text, solange er noch nicht übernommen ist
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState<false | "pointer" | "keyboard">(false);
  // Touch: Tastatur erst, wenn bei offenem Kalender noch einmal ins Feld getippt wird
  const [typing, setTyping] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const coarse = useCoarsePointer();
  const popId = useId();

  const set = (next: string) => {
    if (!controlled) setInner(next);
    if (next !== iso) onChange?.(next);
  };

  const parsed = draft === null ? iso : parseDateDe(draft, todayIso(), min);
  const problem =
    parsed === null
      ? "Kein gültiges Datum. Beispiel: 27.11.2026"
      : parsed && min && parsed < min
        ? `Frühestens ${dateDe(min)}`
        : parsed && max && parsed > max
          ? `Spätestens ${dateDe(max)}`
          : "";

  useEffect(() => {
    input.current?.setCustomValidity(problem);
  }, [problem]);

  // Formular-Reset (auch der automatische nach einer Server Action) stellt den Startwert wieder her
  useEffect(() => {
    const form = input.current?.form;
    if (!form || controlled) return;
    const reset = () => {
      setInner(defaultValue ?? "");
      setDraft(null);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue]);

  const commit = () => {
    if (draft === null) return;
    const p = parseDateDe(draft, todayIso(), min);
    if (p === null) return; // unlesbar: Text bleibt stehen, Feld ist ungültig
    setDraft(null);
    set(p);
  };

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setTyping(false);
    if (refocus) input.current?.focus({ preventScroll: true });
  }, []);

  const select = (day: string) => {
    setDraft(null);
    set(day);
    close(!coarse);
    if (coarse) input.current?.blur();
  };

  const onClick = () => {
    if (!open) setOpen("pointer");
    else if (coarse && !typing) {
      // inputMode wechselt erst beim nächsten Fokus; im Tipp-Ereignis neu fokussieren, damit die Tastatur kommt
      flushSync(() => setTyping(true));
      input.current?.blur();
      input.current?.focus();
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commit();
    const to = e.relatedTarget as Node | null;
    if (to && !wrap.current?.contains(to) && !document.getElementById(popId)?.contains(to)) close(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && draft !== null) {
      // vor dem Absenden übernehmen, damit das versteckte Feld schon den neuen Wert hat
      flushSync(commit);
      setOpen(false);
    } else if (e.key === "ArrowDown" && (e.altKey || open)) {
      e.preventDefault();
      setOpen("keyboard");
    }
  };

  const height = small ? "min-h-9 pointer-coarse:min-h-11 rounded-full text-[13px]" : "min-h-11 rounded-xl text-[15px]";
  return (
    <div ref={wrap} className={`relative flex ${full ? "w-full" : small ? "w-[10.5rem]" : "w-[11.75rem]"} max-w-full ${className}`}>
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        inputMode={coarse && !typing ? "none" : "decimal"}
        autoComplete="off"
        spellCheck={false}
        placeholder="TT.MM.JJJJ"
        aria-label={rest["aria-label"]}
        aria-haspopup="dialog"
        aria-expanded={!!open}
        aria-controls={open ? popId : undefined}
        aria-invalid={problem ? true : undefined}
        title={problem || undefined}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        value={draft ?? formatDateDe(iso)}
        onChange={(e) => setDraft(e.target.value)}
        // iPhone: erster Tipp öffnet nur den Kalender, ohne Tastatur; ein weiterer Tipp ins Feld erlaubt das Tippen
        onClick={onClick}
        onFocus={(e) => !coarse && e.target.select()}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`${height} w-full border border-line bg-surface pl-3 pr-10 text-ink tabular-nums outline-none placeholder:text-muted/60 focus:border-ink focus:ring-1 focus:ring-ink disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger pointer-coarse:text-base`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Kalender öffnen"
        aria-haspopup="dialog"
        aria-expanded={!!open}
        onClick={() => (open ? close(false) : setOpen(coarse ? "pointer" : "keyboard"))}
        className={`absolute inset-y-0 right-0 flex w-10 pointer-coarse:w-11 items-center justify-center text-muted hover:text-ink disabled:opacity-50 ${small ? "rounded-r-full" : "rounded-r-xl"}`}
      >
        <CalendarDays size={small ? 15 : 17} aria-hidden="true" />
      </button>
      {name && <input type="hidden" name={name} value={parsed ?? iso} />}
      {open && (
        <Popover anchor={wrap} onClose={close}>
          <div id={popId}>
            <Calendar value={parsed || iso} min={min} max={max} onSelect={select} autoFocus={open === "keyboard"} />
          </div>
        </Popover>
      )}
    </div>
  );
}
