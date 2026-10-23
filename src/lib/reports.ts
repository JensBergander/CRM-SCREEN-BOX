import "server-only";
import { eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { companies, deals, lexwareVouchers, LOST_REASONS, type LostReason } from "@/db/schema";

const net = (v: { netAmount: string | null; totalAmount: string | null }) =>
  v.netAmount !== null ? Number(v.netAmount) : Number(v.totalAmount ?? 0) / 1.19; // ohne Details: grob aus Brutto

export type Period = "12m" | "jahr" | "alles";

function since(period: Period): Date {
  const now = new Date();
  if (period === "jahr") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  if (period === "12m") return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1));
  return new Date(0);
}

export async function lexwareReport(period: Period) {
  const from = since(period);
  const vouchers = (await db.select().from(lexwareVouchers).where(gte(lexwareVouchers.voucherDate, from))).filter(
    (v) => !["voided", "draft"].includes(v.status),
  );
  const invoices = vouchers.filter((v) => v.type === "invoice");
  const quotations = vouchers.filter((v) => v.type === "quotation");

  // Umsatz je Monat (netto), lückenlos
  const months: { key: string; label: string; value: number }[] = [];
  const start = period === "alles" && invoices.length
    ? new Date(Math.min(...invoices.map((v) => v.voucherDate!.getTime())))
    : from;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const end = new Date();
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    months.push({
      key,
      label: new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(cursor),
      value: 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  for (const inv of invoices) {
    const month = months.find((m) => m.key === inv.voucherDate!.toISOString().slice(0, 7));
    if (month) month.value += net(inv);
  }

  // Angebote je Kunde: wie viele angefragt, wie viele angenommen
  const byCustomer = new Map<string, { contactId: string; name: string; offers: number; accepted: number; rejected: number; open: number; revenue: number }>();
  const row = (v: (typeof vouchers)[number]) => {
    const key = v.contactId ?? v.contactName ?? "?";
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { contactId: v.contactId ?? "", name: v.contactName ?? "Unbekannt", offers: 0, accepted: 0, rejected: 0, open: 0, revenue: 0 });
    }
    return byCustomer.get(key)!;
  };
  for (const q of quotations) {
    const r = row(q);
    r.offers++;
    if (q.status === "accepted") r.accepted++;
    else if (q.status === "rejected") r.rejected++;
    else r.open++;
  }
  for (const inv of invoices) row(inv).revenue += net(inv);

  const companyIds = new Map(
    (await db.select({ id: companies.id, lexwareId: companies.lexwareId }).from(companies)).map((c) => [c.lexwareId, c.id]),
  );
  const customers = [...byCustomer.values()]
    .map((c) => ({ ...c, companyId: companyIds.get(c.contactId) ?? null }))
    .sort((a, b) => b.offers - a.offers || b.revenue - a.revenue);

  const decided = quotations.filter((q) => q.status === "accepted" || q.status === "rejected");
  return {
    months,
    customers,
    totals: {
      revenue: invoices.reduce((s, v) => s + net(v), 0),
      invoices: invoices.length,
      offers: quotations.length,
      accepted: quotations.filter((q) => q.status === "accepted").length,
      // Quote nur über entschiedene Angebote; offene zählen nicht
      acceptRate: decided.length ? quotations.filter((q) => q.status === "accepted").length / decided.length : null,
      openOffers: quotations.filter((q) => q.status === "open" || q.status === "overdue").length,
    },
  };
}

export async function crmReport(period: Period) {
  const from = since(period);
  const rows = (await db.select({ deal: deals, company: companies.name }).from(deals).innerJoin(companies, eq(companies.id, deals.companyId)))
    .filter((r) => r.deal.createdAt >= from);
  const lost = rows.filter((r) => r.deal.stage === "verloren");
  const won = rows.filter((r) => r.deal.number !== null);
  const reasons = LOST_REASONS.map((reason: LostReason) => ({ reason, count: lost.filter((r) => r.deal.lostReason === reason).length }));
  return {
    requests: rows.length,
    won: won.length,
    lost: lost.length,
    compare: rows.filter((r) => r.deal.compareOnly || r.deal.lostReason === "vergleichsangebot").length,
    quick: rows.filter((r) => r.deal.quick).length,
    reasons,
  };
}
