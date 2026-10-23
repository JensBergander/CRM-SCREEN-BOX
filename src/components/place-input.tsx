"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { placeDetailsAction, placeSearchAction, resolveAddressAction, type LocalPlace } from "@/app/(app)/actions";
import type { Place, PlaceSuggestion } from "@/lib/places";
import { inputClass } from "./ui";

type Option =
  | { kind: "local"; key: string; main: string; sub: string; local: LocalPlace }
  | { kind: "google"; key: string; main: string; sub: string; suggestion: PlaceSuggestion };

const newToken = () => crypto.randomUUID();

// Eingabefeld mit Vorschlägen: zuerst eigene Daten, ab drei Buchstaben auch Google.
// Freitext bleibt immer möglich; onPick kommt nur bei einer Auswahl.
export function PlaceInput({ value, onChange, onPick, local = [], withWebsite, placeholder, id, ariaLabel }: {
  value: string;
  onChange: (text: string) => void;
  onPick: (place: Place) => void;
  local?: LocalPlace[];
  withWebsite?: () => boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  // false, sobald Google nicht antwortet (kein Schlüssel, Tagesgrenze): dann nur noch eigene Daten
  const [googleOn, setGoogleOn] = useState(true);
  const token = useRef<string | null>(null);
  // erst nach eigenem Tippen filtern und Google fragen, nicht schon beim vorbelegten Text
  const [typed, setTyped] = useState(false);

  const q = value.trim().toLowerCase();
  const asking = googleOn && typed && q.length >= 3;
  const google = asking ? results : [];
  const localHits = local.filter((p) => !q || !typed || p.label.toLowerCase().includes(q)).slice(0, 5);
  const options: Option[] = [
    ...localHits.map((p, i): Option => ({ kind: "local", key: `l${i}`, main: p.label, sub: p.hint, local: p })),
    ...google
      .filter((g) => !localHits.some((p) => p.label.startsWith(g.main)))
      .map((g): Option => ({ kind: "google", key: g.placeId, main: g.main, sub: g.secondary, suggestion: g })),
  ];

  // Erst nach einer kurzen Tipppause fragen, damit pro Adresse nur wenige Abfragen anfallen
  useEffect(() => {
    if (!asking) return;
    const input = value;
    const timer = setTimeout(async () => {
      token.current ??= newToken();
      const result = await placeSearchAction(input, token.current);
      if (result === null) setGoogleOn(false);
      else setResults(result);
    }, 400);
    return () => clearTimeout(timer);
  }, [value, asking]);

  async function choose(o: Option) {
    setOpen(false);
    setActive(-1);
    setTyped(false);
    if (o.kind === "local") {
      onChange(o.local.label);
      if (o.local.geo) return onPick({ label: o.local.label, ...o.local.geo });
      // Firmenadresse einmal über Google bestätigen, damit Karte und Koordinaten stimmen
      setBusy(true);
      const place = await resolveAddressAction(o.local.label);
      setBusy(false);
      if (place) onPick({ ...place, label: o.local.label });
      return;
    }
    onChange([o.main, o.sub].filter(Boolean).join(", "));
    setBusy(true);
    const place = await placeDetailsAction(o.suggestion.placeId, token.current ?? newToken(), o.main, withWebsite?.() ?? false);
    setBusy(false);
    token.current = null;
    setResults([]);
    if (place) {
      onChange(place.label);
      onPick(place);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const expanded = open && options.length > 0;
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-busy={busy}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setTyped(true);
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${inputClass} pr-10`}
      />
      <Search size={16} aria-hidden="true" className={`pointer-events-none absolute right-3.5 top-3.5 text-muted ${busy ? "animate-pulse" : ""}`} />
      {expanded && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown statt click: sonst schließt das blur die Liste vor der Auswahl
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2 text-sm ${i === active ? "bg-bg" : "hover:bg-bg"}`}
            >
              <MapPin size={15} aria-hidden="true" className={`mt-0.5 shrink-0 ${o.kind === "local" ? "text-ink" : "text-muted"}`} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{o.main}</span>
                {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
              </span>
            </li>
          ))}
          {google.length > 0 && <li aria-hidden="true" className="px-3.5 pb-1 pt-1.5 text-right text-[10px] text-muted">Vorschläge von Google</li>}
        </ul>
      )}
    </div>
  );
}

// Sucht eine Firmenadresse und füllt Straße, PLZ, Ort (und leere Felder wie Website) im selben Formular aus
export function AddressSearch({ fillName = false }: { fillName?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const field = (name: string) => ref.current?.closest("form")?.elements.namedItem(name) as HTMLInputElement | null;
  return (
    <div ref={ref}>
      <PlaceInput
        value={text}
        onChange={setText}
        ariaLabel="Adresse suchen"
        placeholder="Adresse suchen, z. B. Firmenname und Ort"
        withWebsite={() => !!field("website") && !field("website")!.value}
        onPick={(p) => {
          const set = (name: string, v: string | null | undefined, onlyEmpty = false) => {
            const el = field(name);
            if (el && v && !(onlyEmpty && el.value)) el.value = v;
          };
          set("street", p.street);
          set("zip", p.zip);
          set("city", p.city);
          set("website", p.website, true);
          if (fillName) set("name", p.label.split(",")[0], true);
        }}
      />
    </div>
  );
}
