import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, deals } from "@/db/schema";
import { addDaysIso, todayIso } from "./format";

export type DraftItem = { name: string; description?: string; quantity: number; unitName: string; netPrice: number };

// Lexware erwartet Datumsangaben mit Zeitzone; Sommer- und Winterzeit beachten
function berlinDate(iso: string) {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${iso}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value; // z. B. „GMT+2“
  const hours = Number(offset?.replace("GMT", "") || 1);
  return `${iso}T00:00:00.000+${String(hours).padStart(2, "0")}:00`;
}

// Legt in Lexware einen Angebotsentwurf an. Nie abgeschlossen: Prüfen und Versenden passiert in Lexware.
export async function createQuotationDraft(dealId: number, items: DraftItem[]): Promise<string> {
  const [row] = await db
    .select({ deal: deals, lexwareId: companies.lexwareId })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(deals.id, dealId));
  if (!row) throw new Error("Vorgang nicht gefunden");
  if (!row.lexwareId) throw new Error("Die Firma ist nicht mit Lexware verknüpft.");
  if (!items.length) throw new Error("Mindestens eine Position angeben.");

  const today = todayIso();
  const response = await fetch("https://api.lexware.io/v1/quotations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voucherDate: berlinDate(today),
      expirationDate: berlinDate(addDaysIso(today, 30)),
      address: { contactId: row.lexwareId },
      lineItems: items.map((item) => ({
        type: "custom",
        name: item.name,
        description: item.description || undefined,
        quantity: item.quantity,
        unitName: item.unitName,
        unitPrice: { currency: "EUR", netAmount: item.netPrice, taxRatePercentage: 19 },
      })),
      totalPrice: { currency: "EUR" },
      taxConditions: { taxType: "net" },
      title: "Angebot",
      introduction: `Projekt: ${row.deal.title}`,
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data?.details) ? data.details.map((d: { field?: string; message?: string }) => `${d.field}: ${d.message}`).join(", ") : "";
    throw new Error(`Lexware lehnt den Entwurf ab (${response.status}). ${data?.message ?? ""} ${details}`.trim());
  }
  // Nach dem Abschließen in Lexware verknüpft der Abgleich das Angebot über diese ID
  await db.update(deals).set({ lexwareDraftId: data.id }).where(eq(deals.id, dealId));
  await db.insert(activities).values({
    companyId: row.deal.companyId,
    dealId,
    type: "notiz",
    body: "Lexware: Angebotsentwurf angelegt. Nach dem Abschließen in Lexware wird er automatisch verknüpft.",
  });
  return `https://app.lexware.de/permalink/quotations/edit/${data.id}`;
}
