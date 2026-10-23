import type { LostReason, Stage } from "@/db/schema";

export const STAGE_LABEL: Record<Stage, string> = {
  anfrage: "Anfrage",
  angebot: "Angebot verschickt",
  beauftragt: "Beauftragt",
  erledigt: "Erledigt",
  rechnung: "Rechnung gestellt",
  bezahlt: "Bezahlt",
  verloren: "Abgelehnt / Verloren",
};

// Punktfarbe je Phase, wie im Entwurf
export const STAGE_DOT: Record<Stage, string> = {
  anfrage: "bg-[#C7C7CC]",
  angebot: "bg-[#91CCF4]",
  beauftragt: "bg-ink",
  erledigt: "bg-accent",
  rechnung: "bg-[#8E8E93]",
  bezahlt: "bg-[#7A8FA6]",
  verloren: "bg-line",
};

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
