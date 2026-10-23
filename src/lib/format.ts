const TZ = "Europe/Berlin";

const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function euro(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "–";
  return euroFormat.format(Number(value));
}

// Heutiges Datum in Berlin als YYYY-MM-DD
export function todayIso(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateDe(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function daysSince(date: Date | string): number {
  const then = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

export function ageLabel(days: number): string {
  if (days <= 0) return "heute";
  if (days === 1) return "seit 1 Tag";
  return `seit ${days} Tagen`;
}

export function dueLabel(iso: string | null, today = todayIso()): { text: string; overdue: boolean } {
  if (!iso) return { text: "ohne Termin", overdue: false };
  if (iso < today) return { text: "überfällig", overdue: true };
  if (iso === today) return { text: "heute", overdue: false };
  if (iso === addDaysIso(today, 1)) return { text: "morgen", overdue: false };
  return { text: dateDe(iso), overdue: false };
}

export function relativeTime(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Vorschlag für den Ordnernamen: ohne Rechtsform, in Großbuchstaben
export function suggestFolderName(companyName: string): string {
  return companyName
    .replace(/\b(GmbH|mbH|AG|KG|OHG|UG|e\.?\s?V\.?|e\.?\s?K\.?|GbR|Co\.?|&|haftungsbeschränkt|Ltd\.?|Inc\.?)\b/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
