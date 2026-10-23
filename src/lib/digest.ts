import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { appState, companies, deals, lexwareVouchers } from "@/db/schema";
import { addDaysIso, dateDe, daysSince, euro, todayIso } from "./format";
import { graphPost, mailboxes } from "./graph";
import { listInbox, listTasks } from "./queries";

const APP_URL = () => process.env.APP_URL ?? "https://crm.screen-box.de";

type Section = { title: string; rows: { text: string; detail: string; href: string }[] };

export async function buildDigest(): Promise<{ sections: Section[]; total: number }> {
  const today = todayIso();
  const base = APP_URL();
  const dealRows = (stage: "erledigt" | "beauftragt" | "angebot" | "rechnung", olderThanDays: number) =>
    db
      .select({ id: deals.id, title: deals.title, amountNet: deals.amountNet, since: deals.stageChangedAt, company: companies.name, invoiceNumber: deals.invoiceNumber })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(and(eq(deals.stage, stage), lt(deals.stageChangedAt, new Date(`${addDaysIso(today, -olderThanDays)}T23:59:59Z`))))
      .orderBy(asc(deals.stageChangedAt));

  const [billing, running, offers, invoiced, tasks, mails] = await Promise.all([
    dealRows("erledigt", 0),
    dealRows("beauftragt", 14),
    dealRows("angebot", 10),
    dealRows("rechnung", 14),
    listTasks({ open: true, dueUntil: today }),
    listInbox("offen"),
  ]);
  const overdue = invoiced.length
    ? await db
        .select({ number: lexwareVouchers.number, status: lexwareVouchers.status })
        .from(lexwareVouchers)
        .where(inArray(lexwareVouchers.number, invoiced.map((d) => d.invoiceNumber).filter((n): n is string => !!n)))
    : [];
  const statusOf = new Map(overdue.map((v) => [v.number, v.status]));

  const deal = (d: (typeof billing)[number], suffix: string) => ({
    text: `${d.company}: ${d.title}`,
    detail: `${euro(d.amountNet)} · ${suffix}`,
    href: `${base}/vorgaenge/${d.id}`,
  });
  const sections: Section[] = [
    { title: "Erledigt, aber noch nicht abgerechnet", rows: billing.map((d) => deal(d, `seit ${daysSince(d.since)} Tagen erledigt`)) },
    {
      title: "Rechnung gestellt, nach 14 Tagen noch nicht bezahlt",
      rows: invoiced.map((d) => deal(d, `${d.invoiceNumber ?? "ohne Nr."}${statusOf.get(d.invoiceNumber ?? "") === "overdue" ? " · in Lexware überfällig" : ""}`)),
    },
    { title: "Seit über 14 Tagen beauftragt", rows: running.map((d) => deal(d, `seit ${daysSince(d.since)} Tagen`)) },
    { title: "Angebote ohne Rückmeldung (über 10 Tage)", rows: offers.map((d) => deal(d, `verschickt vor ${daysSince(d.since)} Tagen`)) },
    {
      title: "Fällige und überfällige Aufgaben",
      rows: tasks.map((t) => ({
        text: t.title,
        detail: [t.companyName, t.dueDate && t.dueDate < today ? `fällig seit ${dateDe(t.dueDate)}` : "heute"].filter(Boolean).join(" · "),
        href: t.dealId ? `${base}/vorgaenge/${t.dealId}` : `${base}/aufgaben`,
      })),
    },
  ].filter((s) => s.rows.length > 0);
  if (mails.length) {
    sections.push({
      title: "Mails ohne Zuordnung",
      rows: [{ text: `${mails.length} Mails warten im Posteingang`, detail: "", href: `${base}/posteingang` }],
    });
  }
  return { sections, total: sections.reduce((s, x) => s + x.rows.length, 0) };
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function renderHtml(sections: Section[]) {
  const body = sections
    .map(
      (s) => `<h2 style="font-size:16px;margin:28px 0 8px;color:#1d1d1f">${escape(s.title)} (${s.rows.length})</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${s.rows
        .map(
          (r) => `<tr><td style="padding:8px 0;border-top:1px solid #e5e5ea"><a href="${r.href}" style="color:#1d1d1f;font-weight:600;text-decoration:none">${escape(r.text)}</a>${
            r.detail ? `<br><span style="color:#6e6e73">${escape(r.detail)}</span>` : ""
          }</td></tr>`,
        )
        .join("")}</table>`,
    )
    .join("");
  return `<div style="font-family:-apple-system,Inter,Arial,sans-serif;max-width:640px;color:#1d1d1f">
<p style="font-size:15px">Guten Morgen, hier ist alles, was im CRM gerade offen ist.</p>${body}
<p style="margin-top:32px"><a href="${APP_URL()}" style="background:#1d1d1f;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600">CRM öffnen</a></p></div>`;
}

export async function sendDigest(): Promise<{ sent: boolean; total: number }> {
  const { sections, total } = await buildDigest();
  if (total === 0) return { sent: false, total };
  const from = mailboxes()[0];
  const to = process.env.DIGEST_TO ?? from;
  await graphPost(`/users/${encodeURIComponent(from)}/sendMail`, {
    message: {
      subject: `CRM: ${total} offene Punkte für diese Woche`,
      body: { contentType: "HTML", content: renderHtml(sections) },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: false,
  });
  return { sent: true, total };
}

// Montags ab 7 Uhr (Berlin) einmal pro Woche
export async function sendDigestIfDue(): Promise<string> {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (weekday !== "Mon" || hour < 7) return "nicht fällig";

  const week = todayIso();
  const [state] = await db.select().from(appState).where(eq(appState.key, "digest_sent"));
  if (state?.value === week) return "diese Woche schon verschickt";
  const result = await sendDigest();
  await db.insert(appState).values({ key: "digest_sent", value: week }).onDuplicateKeyUpdate({ set: { value: week } });
  return result.sent ? `verschickt (${result.total} Punkte)` : "nichts offen, keine Mail";
}
