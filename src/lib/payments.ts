import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, deals, lexwareVouchers, tasks } from "@/db/schema";
import { addDaysIso, todayIso } from "./format";

// Ohne Lexware-Fälligkeit und ohne Zahlungsziel an der Firma
export const DEFAULT_TERM_DAYS = 14;
// Zahlungsmoral: erst ab so vielen bezahlten Rechnungen aussagekräftig
const MIN_PAID = 2;
// Ab dieser Abweichung (Tage) schlägt das CRM vor, das Zahlungsziel anzupassen
const SUGGEST_AFTER = 5;

const DAY = 86_400_000;
// Kalendertag in Berlin (Lexware speichert Belegdaten als Mitternacht deutscher Zeit)
const berlinDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
const iso = (d: Date | null | undefined) => (d ? berlinDay.format(d) : null);
const diffDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a ?? b);

export type PaymentDue = {
  // erwartetes Zahlungsdatum: das spätere aus Lexware-Fälligkeit und Zahlungsziel der Firma
  expected: string;
  lexwareDue: string | null;
  // Rechnung sagt X Tage, die Firma zahlt üblich nach Y Tagen
  mismatch: { invoiceDays: number; termDays: number } | null;
};

export function paymentDue(input: {
  invoiceDate: Date | null;
  dueDate: Date | null;
  stageChangedAt: Date;
  termDays: number | null;
}): PaymentDue {
  const base = iso(input.invoiceDate) ?? iso(input.stageChangedAt)!;
  const lexwareDue = iso(input.dueDate);
  const termDue = input.termDays !== null ? addDaysIso(base, input.termDays) : null;
  const invoiceDays = lexwareDue ? diffDays(base, lexwareDue) : null;
  return {
    expected: later(lexwareDue, termDue) ?? addDaysIso(base, DEFAULT_TERM_DAYS),
    lexwareDue,
    mismatch:
      input.termDays !== null && invoiceDays !== null && invoiceDays !== input.termDays
        ? { invoiceDays, termDays: input.termDays }
        : null,
  };
}

export type DealPayment = PaymentDue & {
  // für die Vorschau: zahlt die Firma erfahrungsgemäß später als fällig, gilt ihr Schnitt
  forecast: string;
  amount: number;
  // true: offener Betrag aus Lexware (brutto); false: Nettobetrag aus dem Vorgang
  gross: boolean;
  companyId: number;
};

// Fälligkeit je Vorgang in „Rechnung gestellt“ (für Board, Vorgang und Vorschau)
export async function paymentDues(dealIds?: number[]): Promise<Map<number, DealPayment>> {
  const rows = await db
    .select({
      id: deals.id,
      companyId: deals.companyId,
      stageChangedAt: deals.stageChangedAt,
      amountNet: deals.amountNet,
      termDays: companies.paymentTermDays,
      invoiceDate: lexwareVouchers.voucherDate,
      dueDate: lexwareVouchers.dueDate,
      open: lexwareVouchers.openAmount,
    })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .leftJoin(lexwareVouchers, and(eq(lexwareVouchers.number, deals.invoiceNumber), eq(lexwareVouchers.type, "invoice")))
    .where(and(eq(deals.stage, "rechnung"), dealIds ? inArray(deals.id, dealIds.length ? dealIds : [0]) : undefined));
  const morals = await paymentMorals(rows.map((r) => r.companyId));
  return new Map(
    rows.map((r) => {
      const due = paymentDue({ ...r, termDays: r.termDays ?? null });
      // Vorschau: zahlt die Firma erfahrungsgemäß später, gilt ihr Schnitt
      const moral = morals.get(r.companyId);
      const byMoral = moral && r.invoiceDate ? addDaysIso(iso(r.invoiceDate)!, moral.avgDays) : null;
      const row: DealPayment = {
        ...due,
        forecast: later(due.expected, byMoral)!,
        amount: r.open !== null ? Number(r.open) : Number(r.amountNet ?? 0),
        gross: r.open !== null,
        companyId: r.companyId,
      };
      return [r.id, row] as const;
    }),
  );
}

export type PaymentMoral = { avgDays: number; count: number };

// Zahlungsmoral: Tage von der Rechnung (Lexware) bis „Bezahlt“. Vorgänge, die gleich als bezahlt angelegt wurden
// (Import aus Lexware), haben kein echtes Zahlungsdatum und zählen nicht.
export async function paymentMorals(companyIds: number[]): Promise<Map<number, PaymentMoral>> {
  const ids = [...new Set(companyIds)];
  if (!ids.length) return new Map();
  const rows = await db
    .select({ companyId: deals.companyId, paidAt: deals.stageChangedAt, createdAt: deals.createdAt, invoiceDate: lexwareVouchers.voucherDate })
    .from(deals)
    .innerJoin(lexwareVouchers, and(eq(lexwareVouchers.number, deals.invoiceNumber), eq(lexwareVouchers.type, "invoice")))
    .where(and(eq(deals.stage, "bezahlt"), inArray(deals.companyId, ids)));
  const byCompany = new Map<number, number[]>();
  for (const r of rows) {
    if (!r.invoiceDate || r.paidAt.getTime() - r.createdAt.getTime() < DAY) continue;
    const days = diffDays(iso(r.invoiceDate)!, iso(r.paidAt)!);
    if (days < 0 || days > 365) continue;
    byCompany.set(r.companyId, [...(byCompany.get(r.companyId) ?? []), days]);
  }
  const result = new Map<number, PaymentMoral>();
  for (const [id, list] of byCompany) {
    if (list.length >= MIN_PAID) result.set(id, { avgDays: Math.round(list.reduce((s, d) => s + d, 0) / list.length), count: list.length });
  }
  return result;
}

// Vorschlag „Zahlungsziel anpassen?“, wenn die Firma deutlich anders zahlt als eingetragen
export function termSuggestion(moral: PaymentMoral | undefined, termDays: number | null): number | null {
  if (!moral) return null;
  return Math.abs(moral.avgDays - (termDays ?? DEFAULT_TERM_DAYS)) >= SUGGEST_AFTER ? moral.avgDays : null;
}

// „Zahlung prüfen“ an die erwartete Zahlung anpassen. Von Hand verschobene Aufgaben bleiben, wie sie sind.
export async function refreshPaymentTasks(dealIds?: number[]): Promise<number> {
  const dues = await paymentDues(dealIds);
  if (!dues.size) return 0;
  const open = await db
    .select({ id: tasks.id, dealId: tasks.dealId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.kind, "zahlung"), isNull(tasks.doneAt), eq(tasks.manualDue, false), inArray(tasks.dealId, [...dues.keys()])));
  let changed = 0;
  for (const t of open) {
    const due = dues.get(t.dealId!);
    if (!due || t.dueDate === due.expected) continue;
    await db.update(tasks).set({ dueDate: due.expected }).where(eq(tasks.id, t.id));
    changed++;
  }
  return changed;
}

// Geldeingang der nächsten 4 Wochen, Woche für Woche (ab Montag); Überfälliges extra
export async function incomingForecast(weeks = 4) {
  const today = todayIso();
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const monday = addDaysIso(today, 1 - wd);
  const dues = await paymentDues();
  const buckets = Array.from({ length: weeks }, (_, i) => ({ from: addDaysIso(monday, i * 7), to: addDaysIso(monday, i * 7 + 6), sum: 0, count: 0, net: false }));
  const overdue = { sum: 0, count: 0, net: false };
  for (const d of dues.values()) {
    const when = d.forecast;
    const target = when < today ? overdue : buckets.find((b) => when >= b.from && when <= b.to);
    if (!target) continue;
    target.sum += d.amount;
    target.count++;
    if (!d.gross) target.net = true;
  }
  return { overdue, weeks: buckets, later: [...dues.values()].filter((d) => d.forecast > buckets.at(-1)!.to).length };
}
