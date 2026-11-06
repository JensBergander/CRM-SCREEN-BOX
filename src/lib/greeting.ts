// Begrüßung auf der Startseite: nach Uhrzeit und Wochentag in Berlin, mit etwas Abwechslung.
// Die Auswahl hängt vom Datum ab (nicht vom Zufall), damit sie beim Neuladen am selben Tag gleich bleibt.

export function berlinNow(date: Date) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Berlin",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"].indexOf(get("weekday").replace(".", ""));
  return { hour: Number(get("hour")), weekday, day: Number(get("day")), month: Number(get("month")) };
}

export type DayContext = {
  // Produktionstage heute (Firma bzw. Titel), überfällige Aufgaben, offen zur Abrechnung
  shootingToday: number;
  overdue: number;
  billing: number;
};

const pick = <T,>(list: T[], seed: number) => list[seed % list.length];

export function greeting(date: Date, firstName: string | null) {
  const { hour, weekday, day, month } = berlinNow(date);
  const seed = day + month * 31 + hour;
  const name = (text: string) => (firstName ? text.replace("{n}", firstName) : text.replace(/,? \{n\}/, ""));

  if (hour < 5) return name(pick(["Noch wach, {n}?", "Nachtschicht, {n}?", "Späte Stunde, {n}"], seed));
  if (hour < 11) {
    if (weekday === 1) return name(pick(["Guten Start in die Woche, {n}", "Moin, {n} – neue Woche, neues Glück"], seed));
    if (weekday === 0 || weekday === 6) return name("Guten Morgen, {n} – und das am Wochenende");
    return name(pick(["Guten Morgen, {n}", "Moin, {n}", "Morgen, {n} – Kaffee schon da?"], seed));
  }
  if (hour < 14) return name(pick(["Mahlzeit, {n}", "Schönen Mittag, {n}", "Hallo, {n}"], seed));
  if (hour < 18) {
    if (weekday === 5) return name(pick(["Fast Wochenende, {n}", "Schönen Freitag, {n}"], seed));
    if (weekday === 0 || weekday === 6) return name("Schönes Wochenende, {n}");
    return name(pick(["Hallo, {n}", "Schönen Nachmittag, {n}", "Weiter geht’s, {n}"], seed));
  }
  if (hour < 22) {
    if (weekday === 5) return name("Feierabend in Sicht, {n}");
    return name(pick(["Guten Abend, {n}", "Schönen Abend, {n}", "Noch fleißig, {n}?"], seed));
  }
  return name(pick(["Später Feierabend, {n}?", "Guten Abend, {n}", "Noch wach, {n}?"], seed));
}

// Kleine Zeile unter der Begrüßung: was heute wichtig ist, sonst nur das Datum
export function dayLine(date: Date, ctx: DayContext) {
  const today = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(date);
  const notes = [
    ctx.shootingToday === 1 ? "heute wird produziert" : ctx.shootingToday > 1 ? `heute ${ctx.shootingToday} Produktionen` : null,
    ctx.overdue === 1 ? "1 Aufgabe überfällig" : ctx.overdue > 1 ? `${ctx.overdue} Aufgaben überfällig` : null,
    ctx.billing === 1 ? "1 Projekt wartet auf die Rechnung" : ctx.billing > 1 ? `${ctx.billing} Projekte warten auf die Rechnung` : null,
  ].filter(Boolean);
  return [today, ...notes].join(" · ");
}
