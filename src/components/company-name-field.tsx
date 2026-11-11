"use client";

import { useMemo, useState } from "react";
import { Input } from "./ui";

// Schreibweise egal: klein, Umlaute ausgeschrieben, ohne Rechtsform und Trennzeichen
const LEGAL = /\b(gmbh|ag|kg|ug|ohg|gbr|e ?v|mbh|co|se|ltd|inc|haftungsbeschraenkt)\b/g;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL, " ")
    .replace(/\s+/g, "");

// Firmenfeld mit Auswahlliste. Passt der Name nicht genau, sagt es vorher, dass eine neue Firma entsteht,
// und schlägt ähnliche vorhandene vor (ein Tipp übernimmt den richtigen Namen). Kurze Namen wie „TEST“ zählen
// nur, wenn das Getippte in ihnen steckt, nicht umgekehrt.
export function CompanyNameField({
  companies,
  defaultValue = "",
  listId,
  autoFocus,
  placeholder,
}: {
  companies: { id: number; name: string }[];
  defaultValue?: string;
  listId: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const typed = value.trim();
  const keyed = useMemo(() => companies.map((c) => ({ ...c, key: norm(c.name) })), [companies]);
  const exact = typed && companies.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase());
  const q = norm(typed);
  const similar = !exact && q.length >= 3 ? keyed.filter((c) => c.key.includes(q) || (c.key.length >= 5 && q.includes(c.key))).slice(0, 3) : [];

  return (
    <>
      <Input
        name="companyName"
        list={listId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {companies.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      {typed && !exact && (
        <span role="status" className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted">
          {similar.length > 0 ? "Meintest du" : "Neue Firma wird angelegt."}
          {similar.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setValue(c.name)}
              className="inline-flex min-h-7 items-center rounded-full border border-line bg-surface px-2.5 font-semibold text-ink hover:border-ink pointer-coarse:min-h-9"
            >
              {c.name.trim()}
            </button>
          ))}
          {similar.length > 0 && "? Sonst wird eine neue Firma angelegt."}
        </span>
      )}
    </>
  );
}
