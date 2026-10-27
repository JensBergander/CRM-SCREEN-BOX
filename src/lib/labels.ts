import type { LostReason, Stage } from "@/db/schema";
import { STAGE_TONE, TONE_DOT } from "./tones";

export const STAGE_LABEL: Record<Stage, string> = {
  anfrage: "Anfrage",
  angebot: "Angebot verschickt",
  beauftragt: "Beauftragt",
  erledigt: "Erledigt",
  rechnung: "Rechnung gestellt",
  bezahlt: "Bezahlt",
  verloren: "Abgelehnt / Verloren",
};

// Punktfarbe je Phase
export const STAGE_DOT = Object.fromEntries(
  Object.entries(STAGE_TONE).map(([stage, tone]) => [stage, TONE_DOT[tone]]),
) as Record<Stage, string>;

export const BOARD_STAGES: Stage[] = [
  "anfrage",
  "angebot",
  "beauftragt",
  "erledigt",
  "rechnung",
  "bezahlt",
];

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  preis: "Preis",
  vergleichsangebot: "Nur Vergleichsangebot",
  timing: "Timing / Termin",
  wettbewerber: "Anderer Anbieter",
  keine_rueckmeldung: "Keine Rückmeldung",
  sonstiges: "Sonstiges",
};
