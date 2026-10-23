import "server-only";
import { sendAutoReplies } from "./autoreply";
import { sendDigestIfDue } from "./digest";
import { reconcileDeals, syncVouchers } from "./lexware-sync";
import { mailboxes } from "./graph";
import { syncMailboxes } from "./mail";

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
  if (mailboxes().length) {
    await step("mail", syncMailboxes);
    await step("autoantwort", sendAutoReplies);
  }
  if (process.env.LEXWARE_API_KEY) {
    await step("lexware", syncVouchers);
    await step("abgleich", reconcileDeals);
  }
  if (mailboxes().length) await step("montagsmail", sendDigestIfDue);
  return result;
}
