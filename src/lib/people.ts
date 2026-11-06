import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts, people } from "@/db/schema";

// Eine Firmenzuordnung samt Name, Handy und Notizen der Person – die Form, die fast alle Stellen brauchen
export const contactCols = {
  id: contacts.id,
  personId: contacts.personId,
  companyId: contacts.companyId,
  email: contacts.email,
  phone: contacts.phone,
  position: contacts.position,
  fromLexware: contacts.fromLexware,
  endedAt: contacts.endedAt,
  firstName: people.firstName,
  lastName: people.lastName,
  mobile: people.mobile,
  notes: people.notes,
};

export type ContactRow = {
  id: number;
  personId: number;
  companyId: number | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  fromLexware: boolean;
  endedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  notes: string | null;
};

// select … from contacts join people; per .where() weiter einschränken
export const selectContacts = () => db.select(contactCols).from(contacts).innerJoin(people, eq(people.id, contacts.personId));

// Aktuelle (nicht „früher“) Zuordnungen
export const current = isNull(contacts.endedAt);
export const currentAt = (companyId: number) => and(eq(contacts.companyId, companyId), current);

export const fullName = (p: { firstName: string | null; lastName: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ") || "Ohne Namen";

// Platzhalter statt Nachname (z. B. „Arne -“) gelten als leer
const PLACEHOLDER = /^(-+|–|—|\.+|\?+|x+|unbekannt|n\.\s?n\.|nn|n\/a)$/i;
export const cleanName = (value: string | null | undefined) => {
  const v = value?.trim();
  return v && !PLACEHOLDER.test(v) ? v : null;
};

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

type Named = { firstName: string | null; lastName: string | null };
// Gleicher Name: Nachnamen gleich und Vornamen nicht widersprüchlich; ohne Nachnamen müssen die Vornamen gleich sein
export const sameName = (a: Named, b: Named) =>
  a.lastName && b.lastName
    ? same(a.lastName, b.lastName) && (!a.firstName || !b.firstName || same(a.firstName, b.firstName))
    : !a.lastName && !b.lastName && same(a.firstName, b.firstName);

export type NewContact = {
  companyId: number | null;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  position?: string | null;
  fromLexware?: boolean;
};

// Neue Person mit ihrer ersten Zuordnung; liefert die Zuordnungs-ID (contacts.id)
export async function createContact(c: NewContact): Promise<{ contactId: number; personId: number }> {
  const [person] = await db.insert(people).values({ firstName: cleanName(c.firstName), lastName: cleanName(c.lastName), mobile: c.mobile ?? null });
  const personId = person.insertId;
  const [row] = await db.insert(contacts).values({
    personId,
    companyId: c.companyId,
    email: c.email ?? null,
    phone: c.phone ?? null,
    position: c.position ?? null,
    fromLexware: c.fromLexware ?? false,
  });
  return { contactId: row.insertId, personId };
}
