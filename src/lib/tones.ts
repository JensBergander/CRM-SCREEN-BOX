import type { CompanyKind, Stage } from "@/db/schema";

// Farbfamilien aus globals.css. Klassen stehen ausgeschrieben, damit Tailwind sie findet.
export type Tone =
  | "neutral"
  | "info"
  | "lead"
  | "sales"
  | "accent"
  | "done"
  | "invoice"
  | "ok"
  | "danger"
  | "partner"
  | "supplier"
  | "rival";

// Punkt, Balken
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-line",
  info: "bg-sales",
  lead: "bg-lead",
  sales: "bg-sales",
  accent: "bg-accent",
  done: "bg-done",
  invoice: "bg-invoice",
  ok: "bg-ok",
  danger: "bg-danger",
  partner: "bg-partner",
  supplier: "bg-supplier",
  rival: "bg-rival",
};

// Zarte Fläche mit passender Schrift (Badges, Kacheln)
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-line-soft text-ink",
  info: "bg-info-soft text-info-ink",
  lead: "bg-lead-soft text-lead-ink",
  sales: "bg-sales-soft text-sales-ink",
  accent: "bg-accent-soft text-accent-ink",
  done: "bg-done-soft text-done-ink",
  invoice: "bg-invoice-soft text-invoice-ink",
  ok: "bg-ok-soft text-ok-ink",
  danger: "bg-danger-soft text-danger-ink",
  partner: "bg-partner-soft text-partner-ink",
  supplier: "bg-supplier-soft text-supplier-ink",
  rival: "bg-rival-soft text-rival-ink",
};

// Icon in Bereichsfarbe
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  info: "text-info-ink",
  lead: "text-lead",
  sales: "text-sales",
  accent: "text-accent",
  done: "text-done",
  invoice: "text-invoice",
  ok: "text-ok",
  danger: "text-danger",
  partner: "text-partner",
  supplier: "text-supplier",
  rival: "text-rival",
};

// Hauch für ganze Flächen (Board-Spalten); beim Ziehen etwas kräftiger
export const TONE_WASH: Record<Tone, { idle: string; drag: string }> = {
  neutral: { idle: "bg-line-soft", drag: "bg-line" },
  info: { idle: "bg-info-soft/60", drag: "bg-info-soft" },
  lead: { idle: "bg-lead-soft/60", drag: "bg-lead-soft" },
  sales: { idle: "bg-sales-soft/60", drag: "bg-sales-soft" },
  accent: { idle: "bg-accent-soft/60", drag: "bg-accent-soft" },
  done: { idle: "bg-done-soft/60", drag: "bg-done-soft" },
  invoice: { idle: "bg-invoice-soft/60", drag: "bg-invoice-soft" },
  ok: { idle: "bg-ok-soft/60", drag: "bg-ok-soft" },
  danger: { idle: "bg-danger-soft/60", drag: "bg-danger-soft" },
  partner: { idle: "bg-partner-soft/60", drag: "bg-partner-soft" },
  supplier: { idle: "bg-supplier-soft/60", drag: "bg-supplier-soft" },
  rival: { idle: "bg-rival-soft/60", drag: "bg-rival-soft" },
};

// Phasen nach Temperatur: kalt (Anfrage) → Produktion (orange) → Geld (grün)
export const STAGE_TONE: Record<Stage, Tone> = {
  anfrage: "lead",
  angebot: "sales",
  beauftragt: "accent",
  erledigt: "done",
  rechnung: "invoice",
  bezahlt: "ok",
  verloren: "neutral",
};

// Kunde ist der Normalfall und bleibt neutral
export const KIND_TONE: Record<CompanyKind, Tone> = {
  kunde: "neutral",
  dienstleister: "partner",
  lieferant: "supplier",
  wettbewerber: "rival",
};

export const KIND_LABEL: Record<CompanyKind, string> = {
  kunde: "Kunde",
  dienstleister: "Dienstleister",
  lieferant: "Lieferant",
  wettbewerber: "Wettbewerber",
};
