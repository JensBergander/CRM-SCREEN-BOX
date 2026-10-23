import "server-only";
import { and, eq, gte, inArray, isNull, like, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, appState, emails } from "@/db/schema";
import { graphPost } from "./graph";

// Automatische Antwort, wenn Kunden noch an eine alte Adresse (z. B. @bergander-film.de) schreiben.

export const DEFAULT_TEXT = `Guten Tag,

vielen Dank für Ihre Nachricht. Sie ist bei uns angekommen und wird bearbeitet.

Bitte beachten Sie: Die Adresse info@bergander-film.de verwenden wir nicht mehr. Schreiben Sie uns künftig bitte an office@screen-box.de und aktualisieren Sie unsere Kontaktdaten in Ihrem Adressbuch.

Viele Grüße
Jens Bergander
SCREEN-BOX`;

export type AutoReplySettings = { enabled: boolean; domain: string; text: string; since: string | null };

const KEYS = ["autoreply_enabled", "autoreply_domain", "autoreply_text", "autoreply_since"] as const;
// Pro Absender höchstens eine automatische Antwort in diesem Zeitraum
const PER_SENDER_DAYS = 30;

export async function autoReplySettings(): Promise<AutoReplySettings> {
  const rows = await db.select().from(appState).where(inArray(appState.key, [...KEYS]));
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  return {
    enabled: get("autoreply_enabled") === "1",
    domain: get("autoreply_domain") ?? "bergander-film.de",
    text: get("autoreply_text") ?? DEFAULT_TEXT,
    since: get("autoreply_since"),
  };
}

export async function saveAutoReplySettings(input: { enabled: boolean; domain: string; text: string }) {
  const current = await autoReplySettings();
  const values: Record<string, string> = {
    autoreply_enabled: input.enabled ? "1" : "0",
    autoreply_domain: input.domain.trim().toLowerCase().replace(/^@/, ""),
    autoreply_text: input.text.trim(),
  };
  // Beim Einschalten zählt erst ab jetzt: alte Mails bekommen keine Antwort
  if (input.enabled && !current.enabled) values.autoreply_since = new Date().toISOString();
  for (const [key, value] of Object.entries(values)) {
    await db.insert(appState).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
  }
}

export async function sendAutoReplies(): Promise<string> {
  const settings = await autoReplySettings();
  if (!settings.enabled || !settings.since || !settings.domain) return "aus";

  const candidates = await db
    .select()
    .from(emails)
    .where(
      and(
        eq(emails.outgoing, false),
        isNull(emails.autoReply),
        gte(emails.receivedAt, new Date(settings.since)),
        like(emails.toAddresses, `%@${settings.domain}%`),
      ),
    )
    .limit(50);

  let sent = 0;
  for (const mail of candidates) {
    const sender = mail.fromAddress?.toLowerCase();
    const recent = sender
      ? await db
          .select({ n: sql<number>`count(*)` })
          .from(emails)
          .where(
            and(
              eq(emails.fromAddress, sender),
              eq(emails.autoReply, "gesendet"),
              ne(emails.id, mail.id),
              gte(emails.receivedAt, new Date(Date.now() - PER_SENDER_DAYS * 86_400_000)),
            ),
          )
      : [{ n: 1 }];
    // Ignorierte Absender (Systemmails, eigene Adressen, Ignorierliste) bekommen keine Antwort
    if (!sender || mail.status === "ignoriert" || Number(recent[0].n) > 0) {
      await db.update(emails).set({ autoReply: "uebersprungen" }).where(eq(emails.id, mail.id));
      continue;
    }
    try {
      await graphPost(`/users/${encodeURIComponent(mail.mailbox)}/messages/${encodeURIComponent(mail.graphId)}/reply`, {
        comment: settings.text,
      });
      await db.update(emails).set({ autoReply: "gesendet" }).where(eq(emails.id, mail.id));
      if (mail.companyId) {
        await db.insert(activities).values({
          companyId: mail.companyId,
          dealId: mail.dealId,
          type: "mail",
          body: `Automatische Antwort an ${sender}: Hinweis auf office@screen-box.de`,
        });
      }
      sent++;
    } catch (e) {
      // Fehlt die Sende-Berechtigung noch, beim nächsten Lauf erneut versuchen
      if (e instanceof Error && e.message.includes("403")) throw e;
      await db.update(emails).set({ autoReply: "fehler" }).where(eq(emails.id, mail.id));
    }
  }
  return `${sent} gesendet`;
}

export async function autoReplyCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(emails).where(eq(emails.autoReply, "gesendet"));
  return Number(row?.n ?? 0);
}
