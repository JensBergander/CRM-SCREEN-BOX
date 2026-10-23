import "server-only";
import { db } from "@/db";
import { activities, companies, deals, emails, lexwareVouchers } from "@/db/schema";
import { count, eq, isNotNull, sql } from "drizzle-orm";

// Kundeneinschätzung nach dem RFM-Gedanken (Recency, Frequency, Monetary) plus Annahmequote:
//   50 % Annahmequote, geglättet: (angenommen + 1) / (entschieden + 2)
//        → ein Erstanfrager mit einer Absage liegt bei 33 % statt 0 %
//   35 % Umsatz laut Lexware, als Rang gegenüber den übrigen Kunden mit Umsatz (0 … 1)
//   15 % Aktualität des letzten Auftrags: < 1 Jahr 1, < 2 Jahre 0,66, < 3 Jahre 0,33, sonst 0
// Ergebnis 1–5 Sterne. Vorschlag erst ab MIN_OFFERS Angeboten; 0 Sterne vergibt nur der Nutzer.
const WEIGHTS = { quote: 0.5, revenue: 0.35, recency: 0.15 };
export const MIN_OFFERS = 3;

export type CompanyFacts = {
  offers: number; // Angebote insgesamt (Lexware + CRM-Vorgänge ohne Lexware-Angebot)
  accepted: number;
  decided: number; // angenommen oder abgelehnt
  revenue: number; // netto laut Lexware
  lastOrder: Date | null;
  compare: number; // als Vergleichsangebot vermutet oder so verloren
  mails: number;
  calls: number;
  competitors: { id: number; name: string; wins: number }[];
};

export type Rating = {
  stars: number | null; // gültige Sterne: eigene, sonst Vorschlag
  manual: boolean;
  suggested: number | null;
  note: string | null;
  parts: { quote: number; revenue: number; recency: number } | null;
};

const net = (v: { netAmount: string | null; totalAmount: string | null }) =>
  v.netAmount !== null ? Number(v.netAmount) : Number(v.totalAmount ?? 0) / 1.19;

function recencyScore(last: Date | null) {
  if (!last) return 0;
  const years = (Date.now() - last.getTime()) / (365 * 86_400_000);
  return years < 1 ? 1 : years < 2 ? 0.66 : years < 3 ? 0.33 : 0;
}

// Fakten und Bewertung für alle Firmen auf einmal (der Umsatz-Rang braucht den Vergleich)
export async function ratingsForAll(): Promise<Map<number, { facts: CompanyFacts; rating: Rating }>> {
  const [allCompanies, vouchers, allDeals, mailCounts, callCounts, competitorNames] = await Promise.all([
    db.select({ id: companies.id, lexwareId: companies.lexwareId, rating: companies.rating, note: companies.ratingNote }).from(companies),
    db.select().from(lexwareVouchers),
    db.select().from(deals),
    db.select({ id: emails.companyId, n: count() }).from(emails).where(isNotNull(emails.companyId)).groupBy(emails.companyId),
    db.select({ id: activities.companyId, n: count() }).from(activities).where(sql`${activities.type} = 'anruf'`).groupBy(activities.companyId),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.kind, "wettbewerber")),
  ]);
  const mailsBy = new Map(mailCounts.map((r) => [r.id, r.n]));
  const callsBy = new Map(callCounts.map((r) => [r.id, r.n]));
  const competitorName = new Map(competitorNames.map((c) => [c.id, c.name]));

  const facts = new Map<number, CompanyFacts>();
  for (const c of allCompanies) {
    const mine = c.lexwareId ? vouchers.filter((v) => v.contactId === c.lexwareId && !["voided", "draft"].includes(v.status)) : [];
    const quotations = mine.filter((v) => v.type === "quotation");
    const invoices = mine.filter((v) => v.type === "invoice");
    const offerNumbers = new Set(quotations.map((q) => q.number));
    // Angenommen ist ein Angebot auch, wenn daraus eine Rechnung entstanden ist (in Lexware oft nicht markiert)
    const invoiced = new Set(invoices.map((v) => v.quotationId).filter(Boolean));
    const isAccepted = (q: (typeof quotations)[number]) => q.status === "accepted" || invoiced.has(q.id);
    // CRM-Vorgänge ohne Lexware-Angebot zählen zusätzlich, sobald entschieden
    const crm = allDeals.filter((d) => d.companyId === c.id && !(d.offerNumber && offerNumbers.has(d.offerNumber)));
    const crmWon = crm.filter((d) => d.number !== null).length;
    const crmLost = crm.filter((d) => d.stage === "verloren").length;
    const lastInvoice = invoices.map((v) => v.voucherDate).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const companyDeals = allDeals.filter((d) => d.companyId === c.id);
    const wins = new Map<number, number>();
    for (const d of companyDeals) if (d.stage === "verloren" && d.competitorId) wins.set(d.competitorId, (wins.get(d.competitorId) ?? 0) + 1);

    facts.set(c.id, {
      offers: quotations.length + crmWon + crmLost,
      accepted: quotations.filter(isAccepted).length + crmWon,
      decided: quotations.filter((q) => isAccepted(q) || q.status === "rejected").length + crmWon + crmLost,
      revenue: invoices.reduce((s, v) => s + net(v), 0),
      lastOrder: lastInvoice,
      compare: companyDeals.filter((d) => d.compareOnly || d.lostReason === "vergleichsangebot").length,
      mails: Number(mailsBy.get(c.id) ?? 0),
      calls: Number(callsBy.get(c.id) ?? 0),
      competitors: [...wins.entries()]
        .map(([id, n]) => ({ id, name: competitorName.get(id) ?? "Unbekannt", wins: n }))
        .sort((a, b) => b.wins - a.wins),
    });
  }

  // Umsatz-Rang unter allen Firmen mit Umsatz
  const revenues = [...facts.values()].map((f) => f.revenue).filter((r) => r > 0).sort((a, b) => a - b);
  const revenueRank = (r: number) => {
    if (r <= 0 || !revenues.length) return 0;
    const below = revenues.filter((x) => x < r).length;
    return revenues.length === 1 ? 1 : below / (revenues.length - 1);
  };

  const result = new Map<number, { facts: CompanyFacts; rating: Rating }>();
  for (const c of allCompanies) {
    const f = facts.get(c.id)!;
    let suggested: number | null = null;
    let parts: Rating["parts"] = null;
    if (f.offers >= MIN_OFFERS) {
      parts = { quote: (f.accepted + 1) / (f.decided + 2), revenue: revenueRank(f.revenue), recency: recencyScore(f.lastOrder) };
      const score = WEIGHTS.quote * parts.quote + WEIGHTS.revenue * parts.revenue + WEIGHTS.recency * parts.recency;
      suggested = Math.min(5, Math.max(1, 1 + Math.round(score * 4)));
    }
    const manual = c.rating !== null && c.rating !== undefined;
    result.set(c.id, {
      facts: f,
      rating: { stars: manual ? c.rating : suggested, manual, suggested, note: c.note, parts },
    });
  }
  return result;
}

export async function ratingFor(companyId: number) {
  return (await ratingsForAll()).get(companyId) ?? null;
}

// Daten für den Hinweis bei neuen Anfragen; null, wenn kein Hinweis nötig ist (3–5 Sterne oder unbewertet)
export function hintProps(data: { facts: CompanyFacts; rating: Rating }) {
  const f = data.facts;
  return {
    stars: data.rating.stars!,
    manual: data.rating.manual,
    note: data.rating.note,
    facts: [
      `${f.offers} Angebote, ${f.accepted} angenommen`,
      f.competitors[0] && `gewinnt meist: ${f.competitors[0].name}`,
      f.compare > 0 && `${f.compare}× Vergleichsangebot`,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
