"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export type PickPerson = { id: number; name: string };

const pill = (on: boolean, small: boolean) =>
  `inline-flex ${small ? "min-h-8 px-3 text-[12px]" : "min-h-9 px-3.5 text-[13px]"} items-center gap-1.5 rounded-full border font-semibold ${
    on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted hover:text-ink"
  }`;

// „Mit wem?“: Personen der Firma zum Anklicken (mehrere möglich) und „+ Neue Person“, die beim Speichern
// als Kontakt angelegt wird. Freiwillig: ohne Auswahl hängt der Eintrag nur an Firma bzw. Vorgang.
// Schickt personId (mehrfach) und newPerson (mehrfach) mit dem umgebenden Formular.
export function PeoplePicker({
  people,
  initial = [],
  allowNew = true,
  small = false,
  label = "Mit wem?",
}: {
  people: PickPerson[];
  initial?: number[];
  allowNew?: boolean;
  small?: boolean;
  label?: string;
}) {
  const [selected, setSelected] = useState<number[]>(initial.filter((id) => people.some((p) => p.id === id)));
  const [fresh, setFresh] = useState<string[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const toggle = (id: number) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const addFresh = () => {
    const name = typing?.trim();
    if (name && !fresh.includes(name)) setFresh([...fresh, name]);
    setTyping(null);
  };
  const nobody = !selected.length && !fresh.length;

  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        <span className={`mr-1 ${small ? "text-xs" : "text-sm font-semibold"} ${small ? "text-muted" : ""}`}>{small ? "Mit:" : label}</span>
        {people.map((p) => (
          <button key={p.id} type="button" aria-pressed={selected.includes(p.id)} onClick={() => toggle(p.id)} className={pill(selected.includes(p.id), small)}>
            {p.name}
          </button>
        ))}
        {fresh.map((name) => (
          <span key={name} className={pill(true, small)}>
            {name} <span className="font-normal opacity-70">neu</span>
            <button type="button" aria-label={`${name} entfernen`} onClick={() => setFresh(fresh.filter((n) => n !== name))} className="-mr-1">
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
        {allowNew &&
          (typing === null ? (
            <button type="button" onClick={() => setTyping("")} className={`${pill(false, small)} border-dashed`}>
              <Plus size={13} aria-hidden="true" /> Neue Person
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFresh();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setTyping(null);
                  }
                }}
                onBlur={addFresh}
                placeholder="Name, z. B. Alex"
                aria-label="Name der neuen Person"
                className={`${small ? "min-h-8 text-[12px]" : "min-h-9 text-[13px]"} w-40 rounded-full border border-ink bg-surface px-3 outline-none`}
              />
            </span>
          ))}
      </div>
      {nobody && !small && <p className="text-xs text-muted">Niemand ausgewählt, der Eintrag hängt nur an der Firma.</p>}
      {selected.map((id) => (
        <input key={id} type="hidden" name="personId" value={id} />
      ))}
      {fresh.map((name) => (
        <input key={name} type="hidden" name="newPerson" value={name} />
      ))}
    </div>
  );
}

// Ansprechpartner im Vorgang: Auswahl aus den Kontakten der Firma oder „+ Neue Person“ (wird beim Speichern angelegt).
// Schickt contactId bzw. newContact.
export function ContactSelect({ options, defaultValue }: { options: { id: number; name: string }[]; defaultValue?: number | null }) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : "");
  const fresh = value === "neu";
  return (
    <div className="flex flex-col gap-2">
      <select
        name={fresh ? undefined : "contactId"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Ansprechpartner"
        className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-ink"
      >
        <option value="">niemand Bestimmtes</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
        <option value="neu">+ Neue Person …</option>
      </select>
      {fresh && <input name="newContact" autoFocus required placeholder="Name, z. B. Alex" aria-label="Name der neuen Person" className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-ink" />}
    </div>
  );
}
