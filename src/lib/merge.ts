import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, dealSuppliers, deals, emails, tasks } from "@/db/schema";

// Doppelte Firma in eine andere überführen und danach löschen. Die Firma mit Lexware-Nummer bleibt immer;
// haben beide eine, gibt es sie auch in Lexware doppelt, und der tägliche Abgleich würde sie wieder anlegen.
export async function mergeCompanies(fromId: number, intoId: number): Promise<{ keptId: number } | { error: string }> {
  if (fromId === intoId) return { error: "Bitte eine andere Firma wählen." };
  const [a] = await db.select().from(companies).where(eq(companies.id, fromId));
  const [b] = await db.select().from(companies).where(eq(companies.id, intoId));
  if (!a || !b) return { error: "Firma nicht gefunden." };
  if (a.lexwareId && b.lexwareId) {
    return { error: "Beide Firmen sind mit Lexware verknüpft. Bitte zuerst in Lexware zusammenführen, dann hier." };
  }
  const [from, into] = a.lexwareId ? [b, a] : [a, b];

  await db.transaction(async (tx) => {
    // Ansprechpartner: gleiche Mail = dieselbe Person, sonst einfach umhängen
    const theirs = await tx.select().from(contacts).where(eq(contacts.companyId, from.id));
    const ours = await tx.select().from(contacts).where(eq(contacts.companyId, into.id));
    for (const c of theirs) {
      const same = c.email && ours.find((o) => o.email?.toLowerCase() === c.email!.toLowerCase());
      if (!same) {
        await tx.update(contacts).set({ companyId: into.id }).where(eq(contacts.id, c.id));
        continue;
      }
      await tx.update(deals).set({ contactId: same.id }).where(eq(deals.contactId, c.id));
      await tx.update(emails).set({ contactId: same.id }).where(eq(emails.contactId, c.id));
      await tx
        .update(contacts)
        .set({
          phone: same.phone ?? c.phone,
          mobile: same.mobile ?? c.mobile,
          position: same.position ?? c.position,
          notes: [same.notes, c.notes].filter(Boolean).join("\n\n") || null,
        })
        .where(eq(contacts.id, same.id));
      await tx.delete(contacts).where(eq(contacts.id, c.id));
    }

    await tx.update(deals).set({ companyId: into.id }).where(eq(deals.companyId, from.id));
    await tx.update(deals).set({ competitorId: into.id }).where(eq(deals.competitorId, from.id));
    // Lieferant zweimal im selben Projekt: der Eintrag der bleibenden Firma gilt
    const both = await tx.select({ dealId: dealSuppliers.dealId }).from(dealSuppliers).where(eq(dealSuppliers.companyId, into.id));
    if (both.length) {
      await tx
        .delete(dealSuppliers)
        .where(and(eq(dealSuppliers.companyId, from.id), inArray(dealSuppliers.dealId, both.map((r) => r.dealId))));
    }
    await tx.update(dealSuppliers).set({ companyId: into.id }).where(eq(dealSuppliers.companyId, from.id));
    await tx.update(tasks).set({ companyId: into.id }).where(eq(tasks.companyId, from.id));
    await tx.update(activities).set({ companyId: into.id }).where(eq(activities.companyId, from.id));
    await tx.update(emails).set({ companyId: into.id }).where(eq(emails.companyId, from.id));

    // CRM-eigene Felder ergänzen; Stammdaten nur, wenn sie nicht aus Lexware kommen
    const tags = [...new Set([into.tags, from.tags].flatMap((t) => t?.split(",") ?? []).map((t) => t.trim()).filter(Boolean))].join(", ");
    const master = into.lexwareId
      ? {}
      : {
          street: into.street ?? from.street,
          zip: into.zip ?? from.zip,
          city: into.city ?? from.city,
          phone: into.phone ?? from.phone,
          email: into.email ?? from.email,
        };
    await tx
      .update(companies)
      .set({
        ...master,
        rating: into.rating ?? from.rating,
        ratingNote: into.rating !== null ? into.ratingNote : from.ratingNote,
        tags: tags.slice(0, 255) || null,
        folderName: into.folderName ?? from.folderName,
        website: into.website ?? from.website,
        emailDomain: into.emailDomain ?? from.emailDomain,
        industry: into.industry ?? from.industry,
        notes: [into.notes, from.notes].filter(Boolean).join("\n\n") || null,
      })
      .where(eq(companies.id, into.id));
    await tx.delete(companies).where(eq(companies.id, from.id));
    await tx.insert(activities).values({ companyId: into.id, dealId: null, type: "notiz", body: `Firma „${from.name.trim()}“ hierher zusammengeführt` });
  });
  return { keptId: into.id };
}

// Auswahl im Dialog: alle anderen Firmen, Lexware-Firmen mit Nummer
export async function mergeCandidates(exceptId: number) {
  const rows = await db
    .select({ id: companies.id, name: companies.name, lexwareId: companies.lexwareId, number: sql<string | null>`coalesce(${companies.customerNumber}, ${companies.supplierNumber})` })
    .from(companies);
  return rows.filter((r) => r.id !== exceptId).map((r) => ({ ...r, name: r.name.trim() })).sort((x, y) => x.name.localeCompare(y.name, "de"));
}
