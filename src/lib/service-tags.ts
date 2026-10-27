import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

// Feste Auswahl an Pills für Lieferanten, in den Einstellungen pflegbar.
// Früher gab es zusätzlich Dienstleister mit eigenen Gewerken; die stecken jetzt mit in dieser Liste.
export type TagOptions = string[];

const DEFAULTS: TagOptions = [
  "Technikverleih",
  "Licht",
  "Ton",
  "Kamera & Zubehör",
  "Druck",
  "Hardware",
  "Software & Abos",
  "Location & Studio",
  "Transport",
  "Catering",
  "Sprecher",
  "Fotograf",
  "Videograf",
  "Drohnenoperator",
  "Visagist",
  "Cutter",
  "Grafik",
  "Übersetzer",
];
const KEY = "supplier_tags";
// gespeicherte Gewerke der früheren Dienstleister; werden beim ersten Speichern übernommen und gelöscht
const LEGACY_KEY = "service_tags";

export async function serviceTagOptions(): Promise<TagOptions> {
  const rows = await db.select().from(appState).where(inArray(appState.key, [KEY, LEGACY_KEY]));
  const saved = (key: string) => {
    const value = rows.find((r) => r.key === key)?.value;
    return value ? (JSON.parse(value) as string[]) : null;
  };
  const own = saved(KEY);
  const legacy = saved(LEGACY_KEY);
  if (!own && !legacy) return DEFAULTS;
  return [...new Set([...(own ?? DEFAULTS), ...(legacy ?? [])])];
}

export async function saveServiceTagOptions(list: string[]) {
  const value = JSON.stringify([...new Set(list.map((t) => t.trim()).filter(Boolean))].slice(0, 60));
  await db.insert(appState).values({ key: KEY, value }).onDuplicateKeyUpdate({ set: { value } });
  await db.delete(appState).where(eq(appState.key, LEGACY_KEY));
}

// Nur Pills aus der Auswahl übernehmen, in deren Reihenfolge; nur Lieferanten haben welche
export async function pickTags(selected: string[], kind: string): Promise<string | null> {
  if (kind !== "lieferant") return null;
  const options = await serviceTagOptions();
  const chosen = options.filter((o) => selected.includes(o));
  return chosen.length ? chosen.join(", ").slice(0, 255) : null;
}
