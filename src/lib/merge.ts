import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, activityPeople, companies, contacts, dealSuppliers, deals, emails, people, taskPeople, tasks } from "@/db/schema";
import { compatibleNames, contactCols, mergeNames } from "./people";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Abweichende Werte, die beim Zusammenführen keinen Platz mehr haben, als Notiz an der Person behalten
const differs = (kept: string | null, dropped: string | null) =>
  !!dropped && !!kept && kept.replace(/\s/g, "").toLowerCase() !== dropped.replace(/\s/g, "").toLowerCase();

async function keepInNotes(tx: Tx, personId: number, lines: string[]) {
  if (!lines.length) return;
  const [p] = await tx.select({ notes: people.notes }).from(people).where(eq(people.id, personId));
  if (!p) return;
  const notes = [p.notes, `Beim Zusammenführen übernommen: ${lines.join(", ")}`].filter(Boolean).join("\n\n");
  await tx.update(people).set({ notes }).where(eq(people.id, personId));
}

// Zwei Zuordnungen zur selben Firma zu einer machen: Vorgänge und Mails zeigen danach auf die bleibende
async function mergeAffiliation(tx: Tx, fromId: number, intoId: number) {
  const [from] = await tx.select().from(contacts).where(eq(contacts.id, fromId));
  const [into] = await tx.select().from(contacts).where(eq(contacts.id, intoId));
  // schon in diesem Durchlauf zusammengeführt
  if (!from || !into) return;
  await keepInNotes(tx, into.personId, [
    ...(differs(into.email, from.email) ? [`Mail ${from.email}`] : []),
    ...(differs(into.phone, from.phone) ? [`Festnetz ${from.phone}`] : []),
  ]);
  await tx.update(deals).set({ contactId: intoId }).where(eq(deals.contactId, fromId));
  await tx.update(emails).set({ contactId: intoId }).where(eq(emails.contactId, fromId));
  await tx
    .update(contacts)
    .set({
      email: into.email ?? from.email,
      phone: into.phone ?? from.phone,
      position: into.position ?? from.position,
      fromLexware: into.fromLexware || from.fromLexware,
      endedAt: into.endedAt && from.endedAt ? into.endedAt : null,
    })
    .where(eq(contacts.id, intoId));
  await tx.delete(contacts).where(eq(contacts.id, fromId));
}

// Doppelte Person in eine andere überführen: Firmenzuordnungen, Notizen, Aufgaben, Vorgänge und Mails wandern mit
export async function mergePeopleTx(tx: Tx, fromId: number, intoId: number) {
  if (fromId === intoId) return;
  const [from] = await tx.select().from(people).where(eq(people.id, fromId));
  const [into] = await tx.select().from(people).where(eq(people.id, intoId));
  if (!from || !into) return;
  const theirs = await tx.select().from(contacts).where(eq(contacts.personId, fromId));
  const ours = await tx.select().from(contacts).where(eq(contacts.personId, intoId));
  for (const c of theirs) {
    const same = ours.find((o) => o.companyId === c.companyId);
    if (same) await mergeAffiliation(tx, c.id, same.id);
    else await tx.update(contacts).set({ personId: intoId }).where(eq(contacts.id, c.id));
  }
  await tx.execute(sql`insert ignore into ${activityPeople} (activity_id, person_id) select activity_id, ${intoId} from ${activityPeople} where person_id = ${fromId}`);
  await tx.execute(sql`insert ignore into ${taskPeople} (task_id, person_id) select task_id, ${intoId} from ${taskPeople} where person_id = ${fromId}`);
  const [current] = await tx.select({ notes: people.notes }).from(people).where(eq(people.id, intoId));
  const lost = differs(into.mobile, from.mobile) ? [`Beim Zusammenführen übernommen: Handy ${from.mobile}`] : [];
  await tx
    .update(people)
    .set({
      ...mergeNames(into, from),
      mobile: into.mobile ?? from.mobile,
      notes: [current?.notes, from.notes, ...lost].filter(Boolean).join("\n\n") || null,
    })
    .where(eq(people.id, intoId));
  // löscht per Fremdschlüssel auch die restlichen Einträge in activity_people/task_people
  await tx.delete(people).where(eq(people.id, fromId));
}

export async function mergePeople(fromId: number, intoId: number) {
  await db.transaction((tx) => mergePeopleTx(tx, fromId, intoId));
}

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
    // dieselbe Person schon in beiden Firmen: eine Zuordnung genügt
    const theirs = await tx.select(contactCols).from(contacts).innerJoin(people, eq(people.id, contacts.personId)).where(eq(contacts.companyId, from.id));
    const ours = await tx.select(contactCols).from(contacts).innerJoin(people, eq(people.id, contacts.personId)).where(eq(contacts.companyId, into.id));
    for (const c of theirs) {
      // gleiche Mail nur, wenn die Namen zusammenpassen (eine geteilte info@-Adresse macht aus zwei Menschen keinen)
      const same =
        ours.find((o) => o.personId === c.personId) ??
        (c.email ? ours.find((o) => o.email?.toLowerCase() === c.email!.toLowerCase() && compatibleNames(o, c)) : undefined);
      if (!same) {
        await tx.update(contacts).set({ companyId: into.id }).where(eq(contacts.id, c.id));
        continue;
      }
      await mergeAffiliation(tx, c.id, same.id);
      await mergePeopleTx(tx, c.personId, same.personId);
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
