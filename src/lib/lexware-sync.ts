import "server-only";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, deals, lexwareVouchers, voucherFiles, type Deal, type LexwareVoucher } from "@/db/schema";
import { changeStage } from "./pipeline";

const API = "https://api.lexware.io/v1";
const pause = () => new Promise((resolve) => setTimeout(resolve, 600)); // max. 2 Anfragen pro Sekunde

async function lexGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Lexware antwortet mit ${response.status} für ${path.split("?")[0]}`);
  return response.json();
}

type ListItem = {
  id: string;
  voucherType: string;
  voucherStatus: string;
  voucherNumber: string;
  voucherDate?: string;
  dueDate?: string;
  contactId?: string;
  contactName?: string;
  totalAmount?: number;
  openAmount?: number;
};
type Details = {
  totalPrice?: { totalNetAmount?: number };
  relatedVouchers?: { id: string; voucherType: string }[];
  lineItems?: {
    type: string;
    name?: string;
    description?: string;
    quantity?: number;
    unitName?: string;
    unitPrice?: { netAmount?: number };
    lineItemAmount?: number;
    optional?: boolean;
    alternative?: boolean;
  }[];
};

export type LineItem = { name: string; description: string | null; quantity: number | null; unitName: string | null; net: number | null; total: number | null; optional: boolean };

const resource = (v: { type: string }) => (v.type === "invoice" ? "invoices" : "quotations");

// Link zum Beleg in der Lexware-Weboberfläche
export const lexwareUrl = (v: { type: string; id: string }) => `https://app.lexware.de/permalink/${resource(v)}/view/${v.id}`;

async function loadDetails(v: { id: string; type: string }) {
  const details = await lexGet<Details>(`/${resource(v)}/${v.id}`);
  const items: LineItem[] = (details.lineItems ?? [])
    .filter((li) => li.type !== "text" || li.name)
    .map((li) => ({
      name: li.name ?? "",
      description: li.description ?? null,
      quantity: li.quantity ?? null,
      unitName: li.unitName ?? null,
      net: li.unitPrice?.netAmount ?? null,
      total: li.lineItemAmount ?? null,
      optional: !!(li.optional || li.alternative),
    }));
  await db
    .update(lexwareVouchers)
    .set({
      netAmount: details.totalPrice?.totalNetAmount?.toFixed(2) ?? null,
      quotationId: details.relatedVouchers?.find((r) => r.voucherType === "quotation")?.id ?? null,
      lineItems: JSON.stringify(items),
      detailsLoaded: true,
    })
    .where(eq(lexwareVouchers.id, v.id));
}

// PDF eines Belegs aus Lexware holen und in der Datenbank ablegen (einmalig)
async function ensurePdf(v: { id: string; type: string; status: string }) {
  if (v.status === "draft") return;
  const [existing] = await db.select({ id: voucherFiles.voucherId }).from(voucherFiles).where(eq(voucherFiles.voucherId, v.id));
  if (existing) return;
  await pause();
  const { documentFileId } = await lexGet<{ documentFileId?: string }>(`/${resource(v)}/${v.id}/document`);
  if (!documentFileId) return;
  await pause();
  const response = await fetch(`${API}/files/${documentFileId}`, {
    headers: { Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`, Accept: "application/pdf" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Lexware-PDF nicht abrufbar (${response.status})`);
  const pdf = Buffer.from(await response.arrayBuffer());
  await db.insert(voucherFiles).values({ voucherId: v.id, pdf, size: pdf.length }).onDuplicateKeyUpdate({ set: { pdf, size: pdf.length } });
}

// Details und PDF für einen verknüpften Beleg sicherstellen; Fehler hier sollen den Abgleich nicht stoppen
async function secureVoucher(number: string) {
  const [v] = await db.select().from(lexwareVouchers).where(eq(lexwareVouchers.number, number));
  if (!v) return;
  try {
    if (!v.detailsLoaded || v.lineItems === null) {
      await pause();
      await loadDetails(v);
    }
    await ensurePdf(v);
  } catch (e) {
    console.error(`Beleg ${number} konnte nicht vollständig geladen werden:`, e);
  }
}

const PAID = ["paid", "paidoff"];
const DEAD = ["voided", "rejected", "draft"];
// Belegdetails nur für das letzte Jahr und begrenzt pro Lauf nachladen
const DETAILS_PER_RUN = 25;

// Angebote und Rechnungen aus Lexware in den Zwischenspeicher holen.
// quick: nur die Liste, ohne Details nachzuladen (z. B. direkt nach einem Phasenwechsel)
export async function syncVouchers(options: { quick?: boolean } = {}): Promise<number> {
  let count = 0;
  for (let page = 0; ; page++) {
    const data = await lexGet<{ content: ListItem[]; last: boolean }>(
      `/voucherlist?voucherType=invoice,quotation&voucherStatus=any&size=250&page=${page}&sort=voucherDate,DESC`,
    );
    for (const v of data.content) {
      const values = {
        number: v.voucherNumber,
        type: v.voucherType,
        status: v.voucherStatus,
        contactId: v.contactId ?? null,
        contactName: v.contactName?.slice(0, 255) ?? null,
        totalAmount: v.totalAmount?.toFixed(2) ?? null,
        openAmount: v.openAmount?.toFixed(2) ?? null,
        voucherDate: v.voucherDate ? new Date(v.voucherDate) : null,
        dueDate: v.dueDate ? new Date(v.dueDate) : null,
      };
      await db.insert(lexwareVouchers).values({ id: v.id, ...values }).onDuplicateKeyUpdate({ set: values });
      count++;
    }
    if (data.last) break;
    await pause();
  }
  if (options.quick) return count;

  // Details (Nettobetrag, zugehöriges Angebot, Positionen) für neuere Belege nachladen
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const pending = (await db.select().from(lexwareVouchers).where(eq(lexwareVouchers.detailsLoaded, false)))
    .filter((v) => v.voucherDate && v.voucherDate > yearAgo && v.status !== "draft")
    .slice(0, DETAILS_PER_RUN);
  for (const v of pending) {
    await pause();
    await loadDetails(v);
  }
  return count;
}

async function note(deal: Deal, body: string) {
  await db.insert(activities).values({ companyId: deal.companyId, dealId: deal.id, type: "notiz", body: `Lexware: ${body}` });
}

const DAY = 86_400_000;
// Angebote ab 30 Tage vor Anlage des Vorgangs kommen in Frage (das Angebot entsteht oft vor dem Eintrag im CRM),
// Rechnungen nur ab 2 Tage davor, damit keine Rechnung eines früheren Auftrags erwischt wird
const after = (v: LexwareVoucher, deal: Deal, days: number) =>
  !!v.voucherDate && v.voucherDate.getTime() >= deal.createdAt.getTime() - days * DAY;

// Lexware-Belege mit Vorgängen abgleichen; ändert nur eindeutige Fälle
export async function reconcileDeals(): Promise<string[]> {
  const log: string[] = [];
  const active = await db
    .select({ deal: deals, lexwareId: companies.lexwareId })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(and(notInArray(deals.stage, ["verloren", "bezahlt"]), isNotNull(companies.lexwareId)));
  if (!active.length) return log;

  const contactIds = [...new Set(active.map((a) => a.lexwareId!))];
  const vouchers = await db.select().from(lexwareVouchers).where(inArray(lexwareVouchers.contactId, contactIds));
  const used = new Set(
    (await db.select({ o: deals.offerNumber, i: deals.invoiceNumber }).from(deals)).flatMap((d) => [d.o, d.i]).filter(Boolean),
  );

  for (const { deal, lexwareId } of active) {
    const mine = vouchers.filter((v) => v.contactId === lexwareId && !DEAD.includes(v.status));
    let current = deal;

    // 1. Angebot verknüpfen: genau ein neues, noch freies Angebot der Firma
    if (!current.offerNumber && (current.stage === "anfrage" || current.stage === "angebot")) {
      const offers = mine.filter((v) => v.type === "quotation" && !used.has(v.number) && after(v, current, 30));
      if (offers.length === 1) {
        const offer = offers[0];
        await db.update(deals).set({ offerNumber: offer.number, amountNet: current.amountNet ?? offer.netAmount }).where(eq(deals.id, current.id));
        used.add(offer.number);
        current = { ...current, offerNumber: offer.number };
        await note(current, `Angebot ${offer.number} verknüpft`);
        log.push(`${current.title}: Angebot ${offer.number}`);
        if (current.stage === "anfrage") await changeStage(current.id, "angebot");
        current = { ...current, stage: current.stage === "anfrage" ? "angebot" : current.stage };
      }
    }

    const offer = current.offerNumber ? vouchers.find((v) => v.number === current.offerNumber) : undefined;

    // 2. Angebot angenommen → beauftragt
    if (offer?.status === "accepted" && (current.stage === "anfrage" || current.stage === "angebot")) {
      await changeStage(current.id, "beauftragt");
      current = { ...current, stage: "beauftragt" };
      log.push(`${current.title}: Angebot angenommen → Beauftragt`);
    }

    // 3. Rechnung verknüpfen: aus dem Angebot erstellt oder einzige neue Rechnung der Firma
    if (!current.invoiceNumber && ["angebot", "beauftragt", "erledigt"].includes(current.stage)) {
      const free = mine.filter((v) => v.type === "invoice" && !used.has(v.number));
      const fromOffer = offer ? free.filter((v) => v.quotationId === offer.id) : [];
      const otherOpenDeals = active.filter(
        (a) => a.lexwareId === lexwareId && a.deal.id !== current.id && !a.deal.invoiceNumber && ["beauftragt", "erledigt"].includes(a.deal.stage),
      );
      const recent = free.filter((v) => after(v, current, 2));
      const invoice = fromOffer.length === 1 ? fromOffer[0] : recent.length === 1 && otherOpenDeals.length === 0 ? recent[0] : undefined;
      if (invoice) {
        await db.update(deals).set({ invoiceNumber: invoice.number, amountNet: current.amountNet ?? invoice.netAmount }).where(eq(deals.id, current.id));
        used.add(invoice.number);
        current = { ...current, invoiceNumber: invoice.number };
        await note(current, `Rechnung ${invoice.number} verknüpft`);
        log.push(`${current.title}: Rechnung ${invoice.number}`);
      }
    }

    // 4. Phase nach Rechnungsstatus
    const invoice = current.invoiceNumber ? vouchers.find((v) => v.number === current.invoiceNumber) : undefined;
    if (invoice && PAID.includes(invoice.status)) {
      await changeStage(current.id, "bezahlt");
      log.push(`${current.title}: bezahlt`);
    } else if (invoice && ["open", "overdue"].includes(invoice.status) && current.stage !== "rechnung") {
      await changeStage(current.id, "rechnung");
      log.push(`${current.title}: Rechnung gestellt`);
    }
  }

  // Positionen und PDF der Belege laufender Vorgänge sichern (holt Fehlendes nach, höchstens 10 pro Lauf).
  // Abgeschlossene Vorgänge werden übersprungen, damit gelöschte PDF-Kopien nicht wiederkommen.
  const linked = await db
    .select({ o: deals.offerNumber, i: deals.invoiceNumber })
    .from(deals)
    .where(notInArray(deals.stage, ["bezahlt", "verloren"]));
  const numbers = linked.flatMap((d) => [d.o, d.i]).filter((n): n is string => !!n);
  if (numbers.length) {
    const stored = new Set((await db.select({ id: voucherFiles.voucherId }).from(voucherFiles)).map((f) => f.id));
    const missing = (await db.select().from(lexwareVouchers).where(inArray(lexwareVouchers.number, numbers)))
      .filter((v) => !stored.has(v.id) || !v.lineItems)
      .slice(0, 10);
    for (const v of missing) await secureVoucher(v.number);
  }
  return log;
}

// PDF-Kopien aufräumen: 90 Tage nach „Bezahlt“ oder „Verloren“ sowie Kopien ohne Vorgang.
// Das Original bleibt in Lexware; Positionen und Link bleiben im CRM erhalten.
export const PDF_KEEP_DAYS = 90;

export async function cleanupPdfs(): Promise<number> {
  const keep = await db
    .select({ o: deals.offerNumber, i: deals.invoiceNumber, stage: deals.stage, since: deals.stageChangedAt })
    .from(deals);
  const cutoff = Date.now() - PDF_KEEP_DAYS * DAY;
  const needed = new Set(
    keep
      .filter((d) => !["bezahlt", "verloren"].includes(d.stage) || d.since.getTime() > cutoff)
      .flatMap((d) => [d.o, d.i])
      .filter((n): n is string => !!n),
  );
  const files = await db
    .select({ id: voucherFiles.voucherId, number: lexwareVouchers.number })
    .from(voucherFiles)
    .leftJoin(lexwareVouchers, eq(lexwareVouchers.id, voucherFiles.voucherId));
  const remove = files.filter((f) => !f.number || !needed.has(f.number)).map((f) => f.id);
  if (remove.length) await db.delete(voucherFiles).where(inArray(voucherFiles.voucherId, remove));
  return remove.length;
}

// Schneller Abgleich direkt nach einem Phasenwechsel im CRM
export async function quickReconcile(): Promise<string[]> {
  if (!process.env.LEXWARE_API_KEY) return [];
  await syncVouchers({ quick: true });
  return reconcileDeals();
}

// Manuelle Verknüpfung aus dem Vorgang heraus
export async function linkVoucher(dealId: number, voucherId: string) {
  const [voucher] = await db.select().from(lexwareVouchers).where(eq(lexwareVouchers.id, voucherId));
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!voucher || !deal) return;
  await db
    .update(deals)
    .set(
      voucher.type === "invoice"
        ? { invoiceNumber: voucher.number, amountNet: deal.amountNet ?? voucher.netAmount }
        : { offerNumber: voucher.number, amountNet: deal.amountNet ?? voucher.netAmount },
    )
    .where(eq(deals.id, dealId));
  await note(deal, `${voucher.type === "invoice" ? "Rechnung" : "Angebot"} ${voucher.number} von Hand verknüpft`);
  await reconcileDeals();
}
