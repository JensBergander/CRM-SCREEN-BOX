import "server-only";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, deals, emails, people, type CompanyKind, type Stage } from "@/db/schema";
import { ACTIVE_STAGES } from "./queries";
import { fullName, likeWord } from "./people";

export type SearchHit = {
  kind: "firma" | "kontakt" | "vorgang";
  href: string;
  title: string;
  sub: string | null;
  companyKind?: CompanyKind;
  stage?: Stage;
  // nur ungefähr getroffen (Tippfehler); steht immer unter den genauen Treffern
  approx: boolean;
};

export type SearchResult = { firmen: SearchHit[]; kontakte: SearchHit[]; vorgaenge: SearchHit[] };

// Schreibweise egal: klein, Umlaute als ae/oe/ue und als a/o/u, ß = ss, Akzente weg, Trennzeichen weg
function variants(text: string): string[] {
  const base = text.toLowerCase().replace(/ß/g, "ss");
  const spelled = base.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return [...new Set([plain(spelled), plain(base)])];
}

const compact = (s: string) => s.replace(/ /g, "");

// Kleinster Abstand (Tippfehler, Vertauscher) zwischen pattern und irgendeinem Teil von text
function substringDistance(pattern: string, text: string): number {
  const m = pattern.length;
  let prev2 = new Array<number>(text.length + 1).fill(0);
  let prev = new Array<number>(text.length + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const row = new Array<number>(text.length + 1);
    row[0] = i;
    for (let j = 1; j <= text.length; j++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && pattern[i - 1] === text[j - 2] && pattern[i - 2] === text[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row[j] = v;
    }
    prev2 = prev;
    prev = row;
  }
  return Math.min(...prev);
}

type Query = { forms: string[]; words: string[][] };

function parse(q: string): Query {
  const forms = variants(q);
  return { forms: forms.map(compact), words: forms.map((f) => f.split(" ").filter(Boolean)) };
}

// Rang eines Kandidaten: 0 Anfang, 1 Wortanfang, 2 irgendwo, 3 alle Wörter einzeln; ab 10 ungefähr; null = kein Treffer
function rank(query: Query, fields: (string | null | undefined)[]): number | null {
  let best: number | null = null;
  const take = (r: number) => (best = best === null ? r : Math.min(best, r));
  const texts = fields.filter((f): f is string => !!f).flatMap(variants);
  for (const text of texts) {
    const flat = compact(text);
    const starts = text.split(" ").map((_, i, all) => compact(all.slice(i).join(" ")));
    query.forms.forEach((form, k) => {
      if (!form) return;
      if (flat.startsWith(form)) take(0);
      else if (starts.some((s) => s.startsWith(form))) take(1);
      else if (flat.includes(form)) take(2);
      else if (query.words[k].length > 1 && query.words[k].every((w) => flat.includes(w))) take(3);
    });
  }
  if (best !== null) return best;
  // Tippfehler erst ab 5 Zeichen: bis 7 Zeichen ein Fehler, darüber zwei
  const form = query.forms[0];
  if (form.length < 5) return null;
  const allowed = form.length >= 8 ? 2 : 1;
  let distance = Infinity;
  for (const text of texts) distance = Math.min(distance, substringDistance(form, compact(text)));
  return distance <= allowed ? 10 + distance : null;
}

function pick<T>(rows: T[], query: Query, fields: (row: T) => (string | null | undefined)[], tie: (a: T, b: T) => number, limit: number) {
  return rows
    .map((row) => ({ row, r: rank(query, fields(row)) }))
    .filter((x): x is { row: T; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || tie(a.row, b.row))
    .slice(0, limit);
}

const ACTIVE = new Set<string>(ACTIVE_STAGES);

// Firmen, Kontakte und Vorgänge zu einem Suchbegriff, je höchstens limit; genaue Treffer vor ungefähren
export async function searchAll(q: string, limit = 5): Promise<SearchResult> {
  const query = parse(q);
  if (compact(query.forms[0] ?? "").length < 2) return { firmen: [], kontakte: [], vorgaenge: [] };

  const [firms, staff, dealRows] = await Promise.all([
    db
      .select({
        id: companies.id,
        name: companies.name,
        kind: companies.kind,
        city: companies.city,
        folderName: companies.folderName,
        customerNumber: companies.customerNumber,
        supplierNumber: companies.supplierNumber,
      })
      .from(companies),
    db
      .select({
        personId: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        email: contacts.email,
        position: contacts.position,
        ended: contacts.endedAt,
        company: companies.name,
      })
      .from(people)
      .leftJoin(contacts, eq(contacts.personId, people.id))
      .leftJoin(companies, eq(companies.id, contacts.companyId)),
    db
      .select({ id: deals.id, title: deals.title, number: deals.number, stage: deals.stage, changed: deals.stageChangedAt, company: companies.name })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId)),
  ]);

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "de");
  const firmen = pick(firms, query, (f) => [f.name, f.folderName, f.customerNumber, f.supplierNumber], byName, limit).map(({ row: f, r }) => ({
    kind: "firma" as const,
    href: `/firmen/${f.id}`,
    title: f.name.trim(),
    sub: f.city,
    companyKind: f.kind,
    approx: r >= 10,
  }));

  // eine Zeile je Person, mit ihren aktuellen Firmen
  const persons = new Map<number, { personId: number; name: string; reverse: string; emails: string[]; firms: string[] }>();
  for (const s of staff) {
    const p = persons.get(s.personId) ?? {
      personId: s.personId,
      name: fullName(s),
      reverse: [s.lastName, s.firstName].filter(Boolean).join(" "),
      emails: [],
      firms: [],
    };
    if (s.email) p.emails.push(s.email.split("@")[0]);
    if (s.company && !s.ended) p.firms.push(s.company.trim());
    persons.set(s.personId, p);
  }
  const kontakte = pick([...persons.values()], query, (p) => [p.name, p.reverse, ...p.emails], (a, b) => a.name.localeCompare(b.name, "de"), limit).map(
    ({ row: p, r }) => ({
      kind: "kontakt" as const,
      href: `/kontakte/${p.personId}`,
      title: p.name,
      sub: p.firms.join(", ") || null,
      approx: r >= 10,
    }),
  );

  // laufende zuerst, dann die zuletzt bewegten
  const recent = (a: (typeof dealRows)[number], b: (typeof dealRows)[number]) =>
    Number(ACTIVE.has(b.stage)) - Number(ACTIVE.has(a.stage)) || b.changed.getTime() - a.changed.getTime();
  const vorgaenge = pick(dealRows, query, (d) => [d.title, d.number], recent, limit).map(({ row: d, r }) => ({
    kind: "vorgang" as const,
    href: `/vorgaenge/${d.id}`,
    title: d.title,
    sub: d.company.trim(),
    stage: d.stage,
    approx: r >= 10,
  }));

  return { firmen, kontakte, vorgaenge };
}

// Zuletzt geöffnete Seiten (Pfade aus dem Browser) mit aktuellem Namen; Gelöschtes fällt weg
export async function describePaths(paths: string[]): Promise<SearchHit[]> {
  const ids = (prefix: string) =>
    paths.map((p) => p.match(new RegExp(`^/${prefix}/(\\d+)$`))?.[1]).filter((x): x is string => !!x).map(Number);
  const [f, k, v] = [ids("firmen"), ids("kontakte"), ids("vorgaenge")];
  const [firms, persons, dealRows] = await Promise.all([
    f.length ? db.select({ id: companies.id, name: companies.name, kind: companies.kind, city: companies.city }).from(companies).where(inArray(companies.id, f)) : [],
    k.length ? db.select({ id: people.id, firstName: people.firstName, lastName: people.lastName }).from(people).where(inArray(people.id, k)) : [],
    v.length
      ? db
          .select({ id: deals.id, title: deals.title, stage: deals.stage, company: companies.name })
          .from(deals)
          .innerJoin(companies, eq(companies.id, deals.companyId))
          .where(inArray(deals.id, v))
      : [],
  ]);
  const hits = new Map<string, SearchHit>();
  for (const c of firms) hits.set(`/firmen/${c.id}`, { kind: "firma", href: `/firmen/${c.id}`, title: c.name.trim(), sub: c.city, companyKind: c.kind, approx: false });
  for (const p of persons) hits.set(`/kontakte/${p.id}`, { kind: "kontakt", href: `/kontakte/${p.id}`, title: fullName(p), sub: null, approx: false });
  for (const d of dealRows) hits.set(`/vorgaenge/${d.id}`, { kind: "vorgang", href: `/vorgaenge/${d.id}`, title: d.title, sub: d.company.trim(), stage: d.stage, approx: false });
  return paths.map((p) => hits.get(p)).filter((h): h is SearchHit => !!h);
}

// Ergebnisseite: Mails und Notizen/Anrufe mit allen Wörtern (Groß-/Kleinschreibung und Akzente regelt die Datenbank)
export async function searchMailsAndNotes(q: string, limit = 30) {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return { mails: [], notes: [] };
  const mailWhere = and(
    ...words.map((w) =>
      or(like(emails.subject, likeWord(w)), like(emails.preview, likeWord(w)), like(emails.fromName, likeWord(w)), like(emails.fromAddress, likeWord(w)), like(emails.toAddresses, likeWord(w))),
    ),
  );
  const noteWhere = and(inArray(activities.type, ["notiz", "anruf"]), ...words.map((w) => like(activities.body, likeWord(w))));
  const [mails, notes] = await Promise.all([
    db
      .select({
        id: emails.id,
        subject: emails.subject,
        preview: emails.preview,
        fromName: emails.fromName,
        fromAddress: emails.fromAddress,
        toAddresses: emails.toAddresses,
        outgoing: emails.outgoing,
        receivedAt: emails.receivedAt,
        companyId: emails.companyId,
        dealId: emails.dealId,
        company: companies.name,
      })
      .from(emails)
      .leftJoin(companies, eq(companies.id, emails.companyId))
      .where(and(mailWhere, sql`${emails.status} <> 'ignoriert'`))
      .orderBy(desc(emails.receivedAt))
      .limit(limit),
    db
      .select({
        id: activities.id,
        type: activities.type,
        body: activities.body,
        createdAt: activities.createdAt,
        companyId: activities.companyId,
        dealId: activities.dealId,
        company: companies.name,
        deal: deals.title,
      })
      .from(activities)
      .leftJoin(companies, eq(companies.id, activities.companyId))
      .leftJoin(deals, eq(deals.id, activities.dealId))
      .where(noteWhere)
      .orderBy(desc(activities.createdAt))
      .limit(limit),
  ]);
  return { mails, notes };
}
