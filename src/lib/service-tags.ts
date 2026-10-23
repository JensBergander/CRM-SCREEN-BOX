import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

// Feste Auswahl an Gewerken für Dienstleister, in den Einstellungen pflegbar
export const DEFAULT_SERVICE_TAGS = [
  "Sprecher",
  "Fotograf",
  "Videograf",
  "Drohnenoperator",
  "Visagist",
  "Cutter",
  "Ton",
  "Licht",
  "Grafik",
];

export async function serviceTagOptions(): Promise<string[]> {
  const [row] = await db.select().from(appState).where(eq(appState.key, "service_tags"));
  const list = row?.value ? (JSON.parse(row.value) as string[]) : DEFAULT_SERVICE_TAGS;
  return list.length ? list : DEFAULT_SERVICE_TAGS;
}

export async function saveServiceTagOptions(list: string[]) {
  const value = JSON.stringify([...new Set(list.map((t) => t.trim()).filter(Boolean))].slice(0, 40));
  await db.insert(appState).values({ key: "service_tags", value }).onDuplicateKeyUpdate({ set: { value } });
}

// Nur Gewerke aus der Auswahl übernehmen, in deren Reihenfolge
export async function pickTags(selected: string[]): Promise<string | null> {
  const options = await serviceTagOptions();
  const chosen = options.filter((o) => selected.includes(o));
  return chosen.length ? chosen.join(", ").slice(0, 255) : null;
}
