import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, emails, mailSync } from "@/db/schema";
import { graphGet, mailboxes } from "./graph";
import { domainOf } from "./lexware";

type GraphAddress = { emailAddress?: { address?: string; name?: string } };
type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  webLink?: string;
  hasAttachments?: boolean;
  receivedDateTime: string;
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  ccRecipients?: GraphAddress[];
};
type GraphPage = { value: GraphMessage[]; "@odata.nextLink"?: string };

const SELECT = [
  "id", "internetMessageId", "conversationId", "subject", "bodyPreview", "webLink",
  "hasAttachments", "receivedDateTime", "from", "toRecipients", "ccRecipients",
].join(",");

// Wie weit beim ersten Abruf zurückgegangen wird
const HISTORY_DAYS = 365;
// Seiten à 100 Mails pro Postfach und Lauf; der Rest folgt beim nächsten Lauf
const MAX_PAGES_PER_RUN = 10;

function ownDomains(): Set<string> {
  return new Set(mailboxes().map((m) => m.split("@")[1]));
}

function isOwn(address: string | null | undefined): boolean {
  const domain = address?.split("@")[1]?.toLowerCase();
  return !!domain && ownDomains().has(domain);
}

// Ordnet eine Adresse einem Kontakt bzw. einer Firma zu
export async function matchAddress(address: string | null | undefined) {
  if (!address) return null;
  const lower = address.toLowerCase();
  const [contact] = await db
    .select({ id: contacts.id, companyId: contacts.companyId })
    .from(contacts)
    .where(sql`lower(${contacts.email}) = ${lower}`)
    .limit(1);
  if (contact?.companyId) return { companyId: contact.companyId, contactId: contact.id };

  const [byCompanyMail] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.email}) = ${lower}`)
    .limit(1);
  if (byCompanyMail) return { companyId: byCompanyMail.id, contactId: contact?.id ?? null };

  const domain = domainOf(lower);
  if (!domain) return null;
  const [byDomain] = await db.select({ id: companies.id }).from(companies).where(eq(companies.emailDomain, domain)).limit(1);
  return byDomain ? { companyId: byDomain.id, contactId: contact?.id ?? null } : null;
}

// Für ausgehende Mails zählt der erste externe Empfänger
function counterpart(message: GraphMessage, outgoing: boolean): string | null {
  if (!outgoing) return message.from?.emailAddress?.address ?? null;
  const recipients = [...(message.toRecipients ?? []), ...(message.ccRecipients ?? [])]
    .map((r) => r.emailAddress?.address)
    .filter((a): a is string => !!a);
  return recipients.find((a) => !isOwn(a)) ?? null;
}

async function storeMessage(mailbox: string, message: GraphMessage) {
  const fromAddress = message.from?.emailAddress?.address?.toLowerCase() ?? null;
  const outgoing = fromAddress === mailbox || isOwn(fromAddress);
  const other = counterpart(message, outgoing);
  const match = await matchAddress(other);
  const internal = !other; // nur zwischen eigenen Adressen

  await db
    .insert(emails)
    .values({
      graphId: message.id,
      mailbox,
      internetMessageId: message.internetMessageId?.slice(0, 255) ?? null,
      conversationId: message.conversationId?.slice(0, 255) ?? null,
      outgoing,
      fromAddress,
      fromName: message.from?.emailAddress?.name?.slice(0, 255) ?? null,
      toAddresses: (message.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean).join(", "),
      subject: message.subject?.slice(0, 500) ?? null,
      preview: message.bodyPreview ?? null,
      webLink: message.webLink ?? null,
      hasAttachments: !!message.hasAttachments,
      receivedAt: new Date(message.receivedDateTime),
      companyId: match?.companyId ?? null,
      contactId: match?.contactId ?? null,
      status: match ? "zugeordnet" : internal ? "ignoriert" : "neu",
    })
    .onDuplicateKeyUpdate({ set: { webLink: sql`values(${emails.webLink})` } });
}

export type SyncResult = { mailbox: string; fetched: number; done: boolean; error?: string }[];

export async function syncMailboxes(): Promise<SyncResult> {
  const result: SyncResult = [];
  for (const mailbox of mailboxes()) {
    const [state] = await db.select().from(mailSync).where(eq(mailSync.mailbox, mailbox));
    const since = state?.lastReceivedAt ?? new Date(Date.now() - HISTORY_DAYS * 86_400_000);
    let fetched = 0;
    let latest = since;
    let done = false;
    try {
      const filter = `receivedDateTime ge ${since.toISOString()} and isDraft eq false`;
      let next: string | undefined =
        `/users/${encodeURIComponent(mailbox)}/messages?$select=${SELECT}&$top=100` +
        `&$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime asc`;
      for (let page = 0; next && page < MAX_PAGES_PER_RUN; page++) {
        const data: GraphPage = await graphGet<GraphPage>(next);
        for (const message of data.value) {
          await storeMessage(mailbox, message);
          const at = new Date(message.receivedDateTime);
          if (at > latest) latest = at;
          fetched++;
        }
        next = data["@odata.nextLink"];
      }
      done = !next;
      await db
        .insert(mailSync)
        .values({ mailbox, lastReceivedAt: latest, lastRunAt: new Date(), lastError: null })
        .onDuplicateKeyUpdate({ set: { lastReceivedAt: latest, lastRunAt: new Date(), lastError: null } });
      result.push({ mailbox, fetched, done });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db
        .insert(mailSync)
        .values({ mailbox, lastReceivedAt: latest > since ? latest : state?.lastReceivedAt ?? null, lastRunAt: new Date(), lastError: message })
        .onDuplicateKeyUpdate({ set: { lastRunAt: new Date(), lastError: message } });
      result.push({ mailbox, fetched, done: false, error: message });
    }
  }
  await rematchOpenMails();
  return result;
}

// Offene Mails erneut zuordnen, z. B. nachdem eine Firma eine Mail-Domain bekommen hat
export async function rematchOpenMails() {
  const open = await db
    .select({ id: emails.id, fromAddress: emails.fromAddress, toAddresses: emails.toAddresses, outgoing: emails.outgoing })
    .from(emails)
    .where(and(eq(emails.status, "neu"), isNull(emails.companyId)))
    .limit(2000);
  let matched = 0;
  for (const mail of open) {
    const address = mail.outgoing
      ? mail.toAddresses?.split(",").map((a) => a.trim()).find((a) => a && !isOwn(a))
      : mail.fromAddress;
    const match = await matchAddress(address);
    if (match) {
      await db.update(emails).set({ ...match, status: "zugeordnet" }).where(eq(emails.id, mail.id));
      matched++;
    }
  }
  return matched;
}
