import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";
import { todayIso } from "./format";

// Adresssuche über Google Places (New). Abgefragt werden nur Felder der Stufe „Essentials“
// (Adresse, Koordinaten); den Namen liefert der Vorschlag selbst. Nur die Website liegt in
// der teureren Stufe „Enterprise“ und hat deshalb eine eigene Monatsgrenze.
// Zusätzlich zu den Tageskontingenten in Google Cloud zählt das CRM selbst mit.
const API = "https://places.googleapis.com/v1";
const DAILY_LIMIT = Number(process.env.PLACES_DAILY_LIMIT ?? 250);
const WEBSITE_MONTHLY_LIMIT = Number(process.env.PLACES_WEBSITE_MONTHLY_LIMIT ?? 300);
// Vorschläge rund um Aschaffenburg zuerst, ohne andere Orte auszuschließen
const BIAS = { circle: { center: { latitude: 49.9737, longitude: 9.1494 }, radius: 50000 } };

export type PlaceSuggestion = { placeId: string; main: string; secondary: string };
export type Place = {
  label: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  website?: string | null;
};

const key = () => process.env.GOOGLE_PLACES_KEY;
export const placesEnabled = () => !!key();

// Zähler in app_state hochsetzen; false, wenn die Grenze erreicht ist
async function take(counter: string, limit: number) {
  await db
    .insert(appState)
    .values({ key: counter, value: "1" })
    .onDuplicateKeyUpdate({ set: { value: sql`CAST(${appState.value} AS UNSIGNED) + 1` } });
  const [row] = await db.select({ value: appState.value }).from(appState).where(eq(appState.key, counter));
  return Number(row?.value ?? 0) <= limit;
}

async function call<T>(path: string, init: { method: "GET" | "POST"; fieldMask: string; body?: object }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key()!, "X-Goog-FieldMask": init.fieldMask },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

type AutocompleteResponse = {
  suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
};

// null = Google nicht verfügbar (kein Schlüssel, Grenze erreicht oder Fehler)
export async function autocomplete(input: string, sessionToken: string): Promise<PlaceSuggestion[] | null> {
  if (!placesEnabled() || input.trim().length < 3) return null;
  if (!(await take(`places:${todayIso()}`, DAILY_LIMIT))) return null;
  try {
    const data = await call<AutocompleteResponse>("/places:autocomplete", {
      method: "POST",
      fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
      body: { input: input.trim(), sessionToken, languageCode: "de", regionCode: "de", locationBias: BIAS },
    });
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p) => !!p)
      .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }))
      .slice(0, 5);
  } catch (e) {
    console.error(e);
    return null;
  }
}

type DetailsResponse = {
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  websiteUri?: string;
};

export async function placeDetails(placeId: string, sessionToken: string, name: string, withWebsite = false): Promise<Place | null> {
  if (!placesEnabled() || !/^[\w-]+$/.test(placeId)) return null;
  if (!(await take(`places:${todayIso()}`, DAILY_LIMIT))) return null;
  const website = withWebsite && (await take(`places-website:${todayIso().slice(0, 7)}`, WEBSITE_MONTHLY_LIMIT));
  try {
    const d = await call<DetailsResponse>(`/places/${placeId}?languageCode=de&sessionToken=${encodeURIComponent(sessionToken)}`, {
      method: "GET",
      fieldMask: ["formattedAddress", "location", "addressComponents", website && "websiteUri"].filter(Boolean).join(","),
    });
    if (!d.location) return null;
    const part = (type: string, short = false) => {
      const c = d.addressComponents?.find((x) => x.types.includes(type));
      return c ? (short ? c.shortText : c.longText) : null;
    };
    const route = part("route");
    const street = route ? [route, part("street_number")].filter(Boolean).join(" ") : null;
    const zip = part("postal_code");
    const city = part("locality") ?? part("postal_town") ?? part("administrative_area_level_3");
    const country = part("country", true);
    const address = country && country !== "DE" ? d.formattedAddress ?? "" : [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    // Bei Firmen und Orten steht der Name vorne, bei reinen Adressen ist der Name schon die Straße
    const label = !name || address.startsWith(name) || name === street ? address || name : `${name}, ${address}`;
    return { label, street, zip, city, country, lat: d.location.latitude, lng: d.location.longitude, website: d.websiteUri ?? null };
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Freie Adresse (z. B. Firmenadresse aus den Stammdaten) über den ersten Vorschlag bestätigen
export async function resolveAddress(text: string, name: string): Promise<Place | null> {
  const token = crypto.randomUUID();
  const [first] = (await autocomplete(text, token)) ?? [];
  return first ? placeDetails(first.placeId, token, name) : null;
}
