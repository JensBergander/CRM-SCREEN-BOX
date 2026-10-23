// Liest Kontaktdaten aus der Signatur einer Mail (Regeln, keine KI).
// Ergebnis ist ein Vorschlag, den der Nutzer vor dem Speichern prüft.

export type SignatureData = {
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  phone: string;
  mobile: string;
  website: string;
  street: string;
  zip: string;
  city: string;
};

const GREETING = /^(mit\s+)?(freundlichen|besten|beste|viele|liebe|herzliche|sonnige|schöne|lg|vg|mfg|best|kind|warm|cheers|gruß|grüße|regards|danke)\b.*$/i;
const PHONE = /(?:\+|00)?\d[\d\s()./-]{6,}\d/;
const WEB = /\b((?:https?:\/\/)?(?:www\.)[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>]*)?|https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>]*)?)/i;
const SOCIAL = /(facebook|instagram|linkedin|xing|twitter|youtube|tiktok|vimeo|x\.com|google|microsoft|outlook|apple\.com)/i;
const LEGAL = /\b(GmbH|mbH|AG|KG|OHG|UG|GbR|e\.\s?K\.|e\.\s?V\.|Ltd|Inc|Studio|Studios|Agentur|Media|Medien|Film|Filmproduktion|Produktion|Fotografie|Design|Werbeagentur|Verlag)\b/i;
const ROLE = /\b(geschäftsführ|inhaber|gründer|ceo|cto|leitung|leiter|head|manager|marketing|vertrieb|referent|assistenz|projekt|produzent|producer|redakteur|sprecher|sprecherin|schauspieler|fotograf|videograf|kamera|regie|editor|cutter|designer|berater|consultant|koordinat|einkauf|presse|kommunikation|personal|hr)\w*/i;
const ZIP_CITY = /\b(?:D-)?(\d{5})\s+([A-ZÄÖÜ][\wäöüß.\- ]{1,40})$/;
const STREET = /^[A-ZÄÖÜ][\wäöüß.\- ]{2,40}\s\d{1,4}\s?[a-zA-Z]?(?:\s?-\s?\d{1,4})?$/;

// Link-Anhängsel wie <tel:…>, <mailto:…>, <https://…> und Bildplatzhalter [logo] entfernen
function clean(line: string): string {
  return line
    .replace(/<(tel|mailto|https?):[^>]*>/gi, "")
    .replace(/\[[^\]]{0,40}\]/g, "")
    .replace(/[|•·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])([a-zäöüß])/g, (_, p, c) => p + c.toUpperCase());
}

function looksLikeName(line: string) {
  const words = line.split(" ");
  return (
    words.length >= 2 &&
    words.length <= 4 &&
    words.every((w) => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+$/.test(w) || /^(von|van|de|der|zu)$/.test(w)) &&
    !LEGAL.test(line) &&
    !ROLE.test(line)
  );
}

function normalizePhone(raw: string) {
  return raw.replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim();
}

function isMobileNumber(num: string) {
  const digits = num.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  return /^(\+49|0049)1[5-7]/.test(digits) || /^01[5-7]/.test(digits);
}

export function parseSignature(text: string, from: { name?: string | null; address?: string | null }): SignatureData {
  const result: SignatureData = { firstName: "", lastName: "", company: "", position: "", phone: "", mobile: "", website: "", street: "", zip: "", city: "" };
  // Zitierten Verlauf abschneiden, falls doch enthalten
  const body = text.split(/\n(?:-{2,}\s*(?:Original|Ursprüngliche)|Von:\s|From:\s|Am .* schrieb|On .* wrote)/i)[0];
  // „Firma | Straße | Ort“ in einzelne Zeilen aufteilen (Links vorher entfernen, sie enthalten keine Trenner)
  let lines = body
    .split(/\r?\n/)
    .map((l) => l.replace(/<(tel|mailto|https?):[^>]*>/gi, ""))
    .flatMap((l) => l.split(/\s+[|•·]\s+|\s{3,}/))
    .map(clean)
    .filter(Boolean);

  // Ab dem letzten Gruß suchen, sonst die letzten 40 Zeilen
  const greetAt = lines.map((l, i) => (GREETING.test(l) && l.length < 60 ? i : -1)).filter((i) => i >= 0).pop();
  lines = greetAt !== undefined ? lines.slice(greetAt + 1) : lines.slice(-40);

  // Bereich mit Kontaktangaben: erste Häufung von Telefon, Mail oder Website
  const anchors = lines
    .map((l, i) => (PHONE.test(l) || /@/.test(l) || (WEB.test(l) && !SOCIAL.test(l)) ? i : -1))
    .filter((i) => i >= 0);
  const first = anchors[0] ?? 0;
  let last = first;
  for (const a of anchors) if (a - last <= 4) last = a;
  const region = lines.slice(Math.max(0, first - 5), last + 8);
  const head = lines.slice(Math.max(0, first - 5), first);

  for (const line of region) {
    // Mehrere Nummern pro Zeile möglich („T … | M …“); die Beschriftung steht jeweils direkt davor
    if (!ZIP_CITY.test(line)) {
      for (const match of line.matchAll(new RegExp(PHONE.source, "g"))) {
        const phone = match[0];
        if (phone.replace(/\D/g, "").length < 7) continue;
        // Datumsangaben wie 19.11.2026 sind keine Telefonnummern
        if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(phone.trim())) continue;
        const label = line.slice(Math.max(0, match.index! - 12), match.index!);
        if (/\b(fax|f)\W*$/i.test(label)) continue;
        const value = normalizePhone(phone);
        const mobile = /\b(mobil|mobile|handy|cell|m)\W*$/i.test(label) || isMobileNumber(phone);
        if (mobile && !result.mobile) result.mobile = value;
        else if (!mobile && !result.phone) result.phone = value;
      }
    }
    const web = line.match(WEB)?.[0];
    if (web && !SOCIAL.test(web) && !result.website) result.website = web.replace(/\/$/, "");
    const zc = line.match(ZIP_CITY);
    if (zc && !result.zip) {
      result.zip = zc[1];
      result.city = zc[2].trim();
      const idx = region.indexOf(line);
      const before = region[idx - 1];
      if (before && STREET.test(before)) result.street = before;
      const sameLine = line.slice(0, line.indexOf(zc[0])).replace(/[,\s]+$/, "");
      if (!result.street && STREET.test(sameLine)) result.street = sameLine;
    }
  }

  // Name: aus dem Absendernamen, sonst eine Namenszeile über den Kontaktangaben
  const fromName = (from.name ?? "").replace(/[„“"']/g, "").replace(/\(.*\)/, "").trim();
  const nameFromHeader = fromName.includes(",") ? fromName.split(",").reverse().join(" ").trim() : fromName;
  const nameLine = head.find(looksLikeName);
  const name = looksLikeName(titleCase(nameFromHeader)) ? titleCase(nameFromHeader) : nameLine ? titleCase(nameLine) : "";
  if (name) {
    const parts = name.split(" ");
    const particle = parts.findIndex((p, i) => i > 0 && /^(von|van|de|der|zu)$/i.test(p));
    const split = particle > 0 ? particle : parts.length - 1;
    result.firstName = parts.slice(0, split).join(" ");
    result.lastName = parts.slice(split).join(" ");
    // „Blum Christina“ mit christina-blum@…: Reihenfolge an der Mailadresse ausrichten
    const local = (from.address ?? "").split("@")[0].toLowerCase().split(/[._-]/);
    const norm = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    if (local.length >= 2 && norm(local[0]) === norm(result.lastName) && norm(local[local.length - 1]) === norm(result.firstName)) {
      [result.firstName, result.lastName] = [result.lastName, result.firstName];
    }
  } else if (from.address) {
    // Notlösung: vorname.nachname@…
    const local = from.address.split("@")[0];
    const [f, l] = local.split(/[._-]/);
    if (f && l) {
      result.firstName = titleCase(f);
      result.lastName = titleCase(l);
    } else result.lastName = titleCase(local);
  }

  // Position: Zeile mit Rollenbegriff in der Nähe des Namens
  const nameIdx = nameLine ? head.indexOf(nameLine) : -1;
  const roleLine = [...head.slice(nameIdx + 1), ...region].find((l) => ROLE.test(l) && !PHONE.test(l) && !/@/.test(l) && l.length < 80);
  if (roleLine) {
    // „Tom Becker | Senior Producer“: Name vorne abschneiden
    const fullName = `${result.firstName} ${result.lastName}`.trim();
    result.position = roleLine.toLowerCase().startsWith(fullName.toLowerCase()) && fullName
      ? roleLine.slice(fullName.length).trim()
      : roleLine;
  }

  // Firma: Zeile mit Rechtsform oder Branchenwort, sonst aus der Website, sonst der Personenname
  const companyLine = region.find((l) => LEGAL.test(l) && !PHONE.test(l) && !/@/.test(l) && !WEB.test(l) && l.length < 80 && l !== roleLine);
  const host = result.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const personal = !!result.lastName && host.replace(/[^a-z]/gi, "").toLowerCase().includes(result.lastName.replace(/[^a-z]/gi, "").toLowerCase());
  if (companyLine) result.company = companyLine;
  // Einzelperson mit eigener Domain (z. B. nadineschreier.de): Firma = Name
  else if (personal) result.company = `${result.firstName} ${result.lastName}`.trim();
  else if (host) result.company = host;
  if (!result.city) {
    // Ort ohne PLZ: einzelnes großgeschriebenes Wort direkt nach den Kontaktangaben
    const after = lines[last + 1];
    if (after && /^[A-ZÄÖÜ][a-zäöüß-]{2,}$/.test(after) && !LEGAL.test(after)) result.city = after;
  }
  return result;
}
