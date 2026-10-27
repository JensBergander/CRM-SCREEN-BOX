"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { setRatingAction } from "@/app/(app)/actions";
import { euro } from "@/lib/format";
import { btnPrimary, btnQuiet, Textarea } from "./ui";

// Sterne-Anzeige 0–5; vorgeschlagene Bewertungen etwas heller
export function Stars({ value, suggested = false, size = 14 }: { value: number | null; suggested?: boolean; size?: number }) {
  if (value === null) return <span className="text-xs text-muted">nicht bewertet</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 ${suggested ? "opacity-55" : ""}`} aria-label={`${value} von 5 Sternen${suggested ? " (Vorschlag)" : ""}`} title={suggested ? "Vorschlag der App" : "deine Bewertung"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} aria-hidden="true" className={i <= value ? "fill-[#F5B400] text-[#F5B400]" : "text-line"} />
      ))}
      {value === 0 && <span className="ml-1.5 text-xs font-semibold text-danger-ink">keine Angebote mehr</span>}
    </span>
  );
}

export type AssessmentData = {
  companyId: number;
  stars: number | null;
  manual: boolean;
  suggested: number | null;
  note: string | null;
  parts: { quote: number; revenue: number; recency: number } | null;
  offers: number;
  accepted: number;
  revenue: number;
  lastOrder: string | null;
  compare: number;
  mails: number;
  calls: number;
  competitors: { id: number; name: string; wins: number }[];
  minOffers: number;
};

const pct = (v: number) => `${Math.round(v * 100)} %`;

export function AssessmentCard({ data }: { data: AssessmentData }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(data.manual ? data.stars : data.suggested);
  const [note, setNote] = useState(data.note ?? "");
  const [explain, setExplain] = useState(false);
  const [pending, startTransition] = useTransition();
  const save = (rating: number | null) =>
    startTransition(async () => {
      await setRatingAction(data.companyId, rating, note);
      setEditing(false);
    });
  const share = data.offers ? data.accepted / data.offers : 0;

  return (
    <section className="rounded-2xl bg-surface py-2">
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-base font-semibold">Einschätzung</h2>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted hover:text-ink">
            {data.manual ? "Ändern" : "Selbst bewerten"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-line-soft px-5 py-4">
        {!editing ? (
          <div className="flex flex-col gap-1">
            <Stars value={data.stars} suggested={!data.manual} size={20} />
            <p className="text-xs text-muted">
              {data.manual
                ? "deine Bewertung"
                : data.suggested !== null
                  ? "Vorschlag der App"
                  : `Vorschlag ab ${data.minOffers} Angeboten`}
              {data.parts && (
                <button type="button" onClick={() => setExplain(!explain)} className="ml-2 underline" aria-expanded={explain}>
                  Wie berechnet?
                </button>
              )}
            </p>
            {data.note && <p className="mt-1 rounded-lg bg-bg px-3 py-2 text-[13px]">{data.note}</p>}
            {explain && data.parts && (
              <ul className="mt-2 rounded-lg bg-bg px-3 py-2 text-xs text-muted">
                <li>Annahmequote (geglättet): {pct(data.parts.quote)} · Gewicht 50 %</li>
                <li>Umsatz im Vergleich zu anderen Kunden: {pct(data.parts.revenue)} · Gewicht 35 %</li>
                <li>Aktualität des letzten Auftrags: {pct(data.parts.recency)} · Gewicht 15 %</li>
              </ul>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="Sterne" className="flex items-center gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={draft === i}
                  aria-label={i === 0 ? "0 Sterne: keine Angebote mehr" : `${i} Sterne`}
                  onClick={() => setDraft(i)}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[13px] font-semibold ${draft === i ? "bg-ink text-surface" : "bg-bg text-muted hover:text-ink"}`}
                >
                  {i === 0 ? "0" : <span className="flex items-center gap-0.5">{i}<Star size={12} className="fill-current" aria-hidden="true" /></span>}
                </button>
              ))}
            </div>
            {draft === 0 && <p className="text-xs text-danger-ink">0 Sterne: Bei neuen Anfragen dieser Firma erscheint ein deutlicher Hinweis.</p>}
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              Begründung (optional)
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. vergibt immer an Foto Müller" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending || draft === null} onClick={() => save(draft)} className={btnPrimary}>Speichern</button>
              {data.manual && (
                <button type="button" disabled={pending} onClick={() => save(null)} className={btnQuiet}>Vorschlag der App verwenden</button>
              )}
              <button type="button" onClick={() => setEditing(false)} className={btnQuiet}>Abbrechen</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{data.accepted} von {data.offers} Angeboten angenommen</span>
            {data.offers > 0 && <span className="text-xs text-muted">{Math.round(share * 100)} %</span>}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-line-soft" aria-hidden="true">
            <div className="h-full rounded-full bg-ink" style={{ width: `${share * 100}%` }} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">Umsatz (Lexware)</dt>
          <dd className="text-right font-semibold tabular-nums">{euro(data.revenue)}</dd>
          <dt className="text-muted">Letzter Auftrag</dt>
          <dd className="text-right">{data.lastOrder ?? "–"}</dd>
          <dt className="text-muted">Vergleichsangebote</dt>
          <dd className="text-right">{data.compare}</dd>
          <dt className="text-muted">Kontakt</dt>
          <dd className="text-right">{data.mails} Mails · {data.calls} Anrufe</dd>
        </dl>

        {data.competitors.length > 0 && (
          <div className="text-[13px]">
            <p className="mb-1 text-muted">Wettbewerber gewinnt</p>
            <div className="flex flex-wrap gap-1.5">
              {data.competitors.map((c) => (
                <Link key={c.id} href={`/firmen/${c.id}`} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-rival-soft px-2.5 text-[12px] font-semibold text-rival-ink">
                  {c.name} <span className="opacity-70">{c.wins}×</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Hinweis bei neuen Anfragen (Anzeige); Daten liefert RatingHint bzw. der Posteingang
export function RatingHintView({ companyId, stars, manual, note, facts }: { companyId: number; stars: number; manual: boolean; note: string | null; facts: string }) {
  const strong = stars === 0;
  return (
    <div role="note" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm ${strong ? "bg-danger-soft text-danger-ink" : "bg-line-soft text-ink"}`}>
      <Stars value={stars} suggested={!manual} />
      <span className={strong ? "font-semibold" : ""}>
        {strong ? "Achtung: Für diese Firma hast du „keine Angebote mehr“ festgelegt." : "Vorsicht bei dieser Firma."}
      </span>
      <span className="text-[13px] opacity-80">{[note, facts].filter(Boolean).join(" · ")}</span>
      <Link href={`/firmen/${companyId}`} className="text-[13px] underline">Einschätzung ansehen</Link>
    </div>
  );
}
