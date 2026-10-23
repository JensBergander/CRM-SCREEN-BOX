import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

// Feste Auswahl an Pills, in den Einstellungen pflegbar:
// Gewerke für Dienstleister, Kategorien für Lieferanten
export type TagKind = "dienstleister" | "lieferant";
export type TagOptions = Record<TagKind, string[]>;

const DEFAULTS: TagOptions = {
  dienstleister: ["Sprecher", "Fotograf", "Videograf", "Drohnenoperator", "Visagist", "Cutter", "Ton", "Licht", "Grafik"],
  lieferant: [
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
  ],
};
const KEY: Record<TagKind, string> = { dienstleister: "service_tags", lieferant: "supplier_tags" };

export async function serviceTagOptions(kind: TagKind = "dienstleister"): Promise<string[]> {
  const [row] = await db.select().from(appState).where(eq(appState.key, KEY[kind]));
  const list = row?.value ? (JSON.parse(row.value) as string[]) : DEFAULTS[kind];
  return list.length ? list : DEFAULTS[kind];
}

// Beide Listen, z. B. für Formulare, in denen die Art gewechselt werden kann
export async function allTagOptions(): Promise<TagOptions> {
  const [dienstleister, lieferant] = await Promise.all([serviceTagOptions("dienstleister"), serviceTagOptions("lieferant")]);
  return { dienstleister, lieferant };
}

export async function saveServiceTagOptions(list: string[], kind: TagKind = "dienstleister") {
  const value = JSON.stringify([...new Set(list.map((t) => t.trim()).filter(Boolean))].slice(0, 40));
  await db.insert(appState).values({ key: KEY[kind], value }).onDuplicateKeyUpdate({ set: { value } });
}

// Nur Pills aus der Auswahl übernehmen, in deren Reihenfolge; andere Arten haben keine
export async function pickTags(selected: string[], kind: string): Promise<string | null> {
  if (kind !== "dienstleister" && kind !== "lieferant") return null;
  const options = await serviceTagOptions(kind);
  const chosen = options.filter((o) => selected.includes(o));
  return chosen.length ? chosen.join(", ").slice(0, 255) : null;
}
