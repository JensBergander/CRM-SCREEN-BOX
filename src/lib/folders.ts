import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";
import { todayIso } from "./format";

// Standard-Vorlage nach dem Projekt „M2 Fotoshooting“
export const DEFAULT_TEMPLATE = [
  "01 RAW FOOTAGE/01 Video",
  "01 RAW FOOTAGE/02 Foto",
  "01 RAW FOOTAGE/03 Drohne",
  "01 RAW FOOTAGE/04 AUDIO",
  "02 AUDIO",
  "03 MUSIK",
  "04 INSERTS/Video",
  "04 INSERTS/pdf",
  "04 INSERTS/Audio",
  "04 INSERTS/Bilder",
  "05 Downloads",
  "06 Exports/Fotos",
  "06 Exports/Videos",
  "06 Exports/9x16",
].join("\n");

export async function folderTemplate(): Promise<string> {
  const [row] = await db.select().from(appState).where(eq(appState.key, "folder_template"));
  return row?.value ?? DEFAULT_TEMPLATE;
}

// Link für den Helfer „CRM Ordner“ auf dem Mac
export async function folderLink(deal: { title: string; projectDate: string | null }, folderName: string) {
  const template = (await folderTemplate())
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("|");
  const project = `${deal.projectDate ?? todayIso()} ${deal.title}`.replace(/[/:\\]/g, "-");
  const params = new URLSearchParams({ firma: folderName, projekt: project, vorlage: template });
  return { href: `screenbox-ordner://anlegen?${params.toString().replace(/\+/g, "%20")}`, project };
}
