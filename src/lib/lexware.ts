import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { suggestFolderName } from "./format";

const API = "https://api.lexware.io/v1";

type LexwareContact = {
  id: string;
  archived: boolean;
  roles: { customer?: { number: number }; vendor?: { number: number } };
  company?: {
    name: string;
    contactPersons?: {
      firstName?: string;
      lastName: string;
      emailAddress?: string;
      phoneNumber?: string;
      primary?: boolean;
    }[];
  };
  person?: { firstName?: string; lastName: string };
  addresses?: { billing?: { street?: string; zip?: string; city?: string }[] };
  emailAddresses?: Record<string, string[]>;
  phoneNumbers?: Record<string, string[]>;
  note?: string;
};

// Domains, die nichts über die Firma aussagen
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de", "t-online.de",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "yahoo.com", "yahoo.de",
  "icloud.com", "me.com", "live.de", "live.com", "freenet.de", "posteo.de", "aol.com",
]);

export function domainOf(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  return domain && !FREEMAIL.has(domain) ? domain : null;
}

async function fetchPage(role: Role, page: number): Promise<{ content: LexwareContact[]; last: boolean }> {
  const response = await fetch(`${API}/contacts?${role}=true&page=${page}&size=100`, {
    headers: {
      Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Lexware antwortet mit ${response.status}`);
  return response.json();
}

type Role = "customer" | "vendor";
export type ImportResult = { created: number; updated: number; contacts: number; skipped: number; suppliers: number };

// Holt alle Kunden und Lieferanten aus Lexware und legt sie als Firmen und Kontakte an.
// Vorhandene Firmen (gleiche Lexware-ID) werden nur ergänzt, eigene Eingaben bleiben.
// Wer in Lexware Kunde und Lieferant zugleich ist, wird im CRM als Kunde geführt.
export async function importLexwareCustomers(): Promise<ImportResult> {
  if (!process.env.LEXWARE_API_KEY) throw new Error("LEXWARE_API_KEY fehlt");
  const result: ImportResult = { created: 0, updated: 0, contacts: 0, skipped: 0, suppliers: 0 };
  for (const role of ["customer", "vendor"] as const) await importRole(role, result);
  return result;
}

async function importRole(role: Role, result: ImportResult) {
  for (let page = 0; ; page++) {
    const data = await fetchPage(role, page);
    for (const lx of data.content) {
      // Kunden, die zugleich Lieferant sind, hat schon der Kunden-Durchlauf übernommen
      if (lx.archived || (role === "vendor" && lx.roles.customer)) {
        if (lx.archived) result.skipped++;
        continue;
      }
      const supplier = role === "vendor";
      const name = lx.company?.name
        ?? [lx.person?.firstName, lx.person?.lastName].filter(Boolean).join(" ");
      const address = lx.addresses?.billing?.[0];
      const emails = Object.values(lx.emailAddresses ?? {}).flat();
      const phones = Object.values(lx.phoneNumbers ?? {}).flat();
      const persons = lx.company?.contactPersons ?? [];
      const emailDomain = [...emails, ...persons.map((p) => p.emailAddress)]
        .map(domainOf)
        .find(Boolean) ?? null;

      const values = {
        name,
        customerNumber: lx.roles.customer ? String(lx.roles.customer.number) : null,
        supplierNumber: lx.roles.vendor ? String(lx.roles.vendor.number) : null,
        street: address?.street ?? null,
        zip: address?.zip ?? null,
        city: address?.city ?? null,
      };

      const [existing] = await db.select().from(companies).where(eq(companies.lexwareId, lx.id));
      let companyId: number;
      if (existing) {
        await db
          .update(companies)
          .set({
            ...values,
            // Den Namen im CRM nicht überschreiben, er kann bewusst geändert worden sein
            name: existing.name,
            // Lieferant, der inzwischen auch Kunde ist, wird Kunde; andere Arten bleiben, wie sie im CRM gesetzt sind
            kind: existing.kind === "lieferant" && lx.roles.customer ? "kunde" : existing.kind,
            emailDomain: existing.emailDomain ?? emailDomain,
            phone: existing.phone ?? phones[0] ?? null,
            email: existing.email ?? emails[0] ?? null,
          })
          .where(eq(companies.id, existing.id));
        companyId = existing.id;
        result.updated++;
      } else {
        const [inserted] = await db.insert(companies).values({
          ...values,
          kind: supplier ? "lieferant" : "kunde",
          lexwareId: lx.id,
          emailDomain,
          phone: phones[0] ?? null,
          email: emails[0] ?? null,
          folderName: supplier ? null : suggestFolderName(name),
          notes: lx.note ?? null,
        });
        companyId = inserted.insertId;
        result.created++;
        if (supplier) result.suppliers++;
      }

      const people = lx.person
        ? [{ firstName: lx.person.firstName, lastName: lx.person.lastName, emailAddress: emails[0], phoneNumber: phones[0] }]
        : persons;
      for (const p of people) {
        const known = await db
          .select({ id: contacts.id, email: contacts.email, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.companyId, companyId));
        const duplicate = known.some((c) =>
          p.emailAddress ? c.email?.toLowerCase() === p.emailAddress.toLowerCase() : c.lastName === p.lastName,
        );
        if (duplicate) continue;
        await db.insert(contacts).values({
          companyId,
          firstName: p.firstName ?? null,
          lastName: p.lastName,
          email: p.emailAddress ?? null,
          phone: p.phoneNumber ?? null,
        });
        result.contacts++;
      }
    }
    // Lexware erlaubt 2 Anfragen pro Sekunde
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (data.last) break;
  }
}
