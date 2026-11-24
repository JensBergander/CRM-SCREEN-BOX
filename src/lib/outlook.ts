import { addDaysIso } from "./format";

// Neuer Termin in Outlook im Web, vorausgefüllt mit Betreff, Teilnehmer und Link ins CRM.
// Datum und Uhrzeit trägst du in Outlook ein; vorbelegt ist morgen 10:00–10:30 (Ortszeit).
// Das CRM speichert dabei nichts: der Termin kommt über den Kalender-Abgleich zurück.
export function outlookEventUrl({ subject, to, crmPath, today }: { subject: string; to?: string | null; crmPath?: string | null; today: string }) {
  const day = addDaysIso(today, 1);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject,
    startdt: `${day}T10:00:00`,
    enddt: `${day}T10:30:00`,
  });
  if (to) params.set("to", to);
  if (crmPath) params.set("body", `Im CRM: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.screen-box.de"}${crmPath}`);
  return `https://outlook.office.com/calendar/deeplink/compose?${params}`;
}
