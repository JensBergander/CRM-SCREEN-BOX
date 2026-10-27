import {
  BarChart3,
  Building2,
  CalendarRange,
  CheckSquare,
  Columns3,
  Handshake,
  Home,
  Inbox,
  Package,
  Settings,
  Swords,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "./tones";

// Bereiche der App: Seitenleiste und Icon-Kachel im Seitenkopf nutzen dieselbe Farbe
export const AREAS = {
  start: { href: "/", label: "Start", icon: Home, tone: "neutral" },
  vorgaenge: { href: "/vorgaenge", label: "Vorgänge", icon: Columns3, tone: "sales" },
  posteingang: { href: "/posteingang", label: "Posteingang", icon: Inbox, tone: "sales" },
  planung: { href: "/planung", label: "Planung", icon: CalendarRange, tone: "accent" },
  aufgaben: { href: "/aufgaben", label: "Aufgaben", icon: CheckSquare, tone: "accent" },
  firmen: { href: "/firmen", label: "Firmen", icon: Building2, tone: "neutral" },
  kontakte: { href: "/kontakte", label: "Kontakte", icon: Users, tone: "neutral" },
  dienstleister: { href: "/dienstleister", label: "Dienstleister", icon: Handshake, tone: "partner" },
  lieferanten: { href: "/lieferanten", label: "Lieferanten", icon: Package, tone: "supplier" },
  wettbewerber: { href: "/wettbewerber", label: "Wettbewerber", icon: Swords, tone: "rival" },
  auswertungen: { href: "/auswertungen", label: "Auswertungen", icon: BarChart3, tone: "ok" },
  einstellungen: { href: "/einstellungen", label: "Einstellungen", icon: Settings, tone: "neutral" },
} satisfies Record<string, { href: string; label: string; icon: LucideIcon; tone: Tone }>;

export type Area = keyof typeof AREAS;

export const NAV_GROUPS: { title?: string; areas: Area[] }[] = [
  { areas: ["start"] },
  { title: "Verkauf", areas: ["vorgaenge", "posteingang"] },
  { title: "Produktion", areas: ["planung", "aufgaben"] },
  { title: "Adressen", areas: ["firmen", "kontakte", "dienstleister", "lieferanten", "wettbewerber"] },
  { areas: ["auswertungen", "einstellungen"] },
];
