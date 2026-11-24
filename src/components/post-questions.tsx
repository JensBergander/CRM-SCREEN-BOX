"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { advanceDealAction, extendPostAction } from "@/app/(app)/actions";
import { addDaysIso, dateDe } from "@/lib/format";
import { btnPrimary, btnQuiet, FormError, Input } from "./ui";

type Item = { dealId: number; title: string; company: string; postEnd: string | null };

// „Wie lange brauchst du noch?“ für Projekte in Bearbeitung, deren Ende vorbei ist oder fehlt
export function PostQuestions({ items, today, withLink = true }: { items: Item[]; today: string; withLink?: boolean }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.dealId} className="border-t border-line-soft px-5 py-4 first:border-t-0">
          <PostQuestion item={item} today={today} withLink={withLink} />
        </li>
      ))}
    </ul>
  );
}

const QUICK = [
  { days: 1, label: "+1 Tag" },
  { days: 3, label: "+3 Tage" },
  { days: 7, label: "1 Woche" },
];

function PostQuestion({ item, today, withLink }: { item: Item; today: string; withLink: boolean }) {
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(addDaysIso(today, 2));
  const [error, setError] = useState<string>();

  const extend = (until: string) =>
    start(async () => {
      const r = await extendPostAction(item.dealId, until);
      setError(r.error);
    });

  const name = `${item.company} · ${item.title}`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {withLink ? <Link href={`/vorgaenge/${item.dealId}`} className="font-semibold hover:underline">{name}</Link> : <span className="font-semibold">{name}</span>}
        <span className="block text-muted">
          {item.postEnd ? `sollte am ${dateDe(item.postEnd)} fertig sein.` : "ist in Bearbeitung, ein Ende ist nicht eingetragen."} Wie lange brauchst du noch?
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Wie lange noch für ${item.title}?`}>
        {QUICK.map((q) => (
          <button
            key={q.days}
            type="button"
            disabled={pending}
            onClick={() => extend(addDaysIso(today, q.days))}
            title={`fertig bis ${dateDe(addDaysIso(today, q.days))}`}
            className={btnQuiet}
          >
            {q.label}
          </button>
        ))}
        {!picking ? (
          <button type="button" disabled={pending} onClick={() => setPicking(true)} className={btnQuiet}>Datum wählen</button>
        ) : (
          <span className="flex items-center gap-2">
            <label>
              <span className="sr-only">fertig bis</span>
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            </label>
            <button type="button" disabled={pending || !date} onClick={() => extend(date)} className={btnPrimary}>Speichern</button>
          </span>
        )}
        <form action={advanceDealAction.bind(null, item.dealId, "erledigt")} className="ml-auto">
          <button type="submit" disabled={pending} className={btnQuiet}>Ist fertig</button>
        </form>
      </div>
      {error && <FormError message={error} />}
    </div>
  );
}
