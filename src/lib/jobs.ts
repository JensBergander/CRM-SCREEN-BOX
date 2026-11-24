import "server-only";
import { syncAppointments } from "./appointments";
import { sendAutoReplies } from "./autoreply";
import { retryCalendarSync } from "./calendar";
import { sendDigestIfDue } from "./digest";
import { syncLexwareContactsIfDue } from "./lexware";
import { cleanupPdfs, reconcileDeals, syncVouchers } from "./lexware-sync";
import { mailboxes } from "./graph";
import { syncMailboxes } from "./mail";
import { refreshPaymentTasks } from "./payments";
import { startWork } from "./pipeline";
import { createAnniversaryTasks } from "./reminders";
import { retryWebsiteSync, websiteConfigured } from "./website";

// Alles, was regelmäßig laufen soll; jeder Teil scheitert für sich allein
export async function runJobs() {
  const result: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = await fn();
    } catch (e) {
      result[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };
  await step("bearbeitung", startWork);
  if (mailboxes().length) {
    await step("mail", syncMailboxes);
    await step("autoantwort", sendAutoReplies);
  }
  if (process.env.LEXWARE_API_KEY) {
    await step("stammdaten", syncLexwareContactsIfDue);
    await step("lexware", syncVouchers);
    await step("abgleich", reconcileDeals);
    await step("pdf-aufraeumen", cleanupPdfs);
  }
  // nach dem Abgleich: Fälligkeiten aus Lexware sind jetzt aktuell
  await step("zahlung-pruefen", () => refreshPaymentTasks());
  await step("jahres-erinnerung", createAnniversaryTasks);
  if (mailboxes().length) {
    await step("montagsmail", sendDigestIfDue);
    await step("kalender", retryCalendarSync);
    await step("termine", syncAppointments);
  }
  if (websiteConfigured()) await step("website", retryWebsiteSync);
  return result;
}
