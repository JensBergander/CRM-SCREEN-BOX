# CRM SCREEN-BOX – Konzept

Stand: 23.10.2026

Internes CRM für SCREEN-BOX (Foto und Video für Unternehmen). Vorbild ist HubSpot, aber nur mit den Teilen, die im Alltag gebraucht werden. Hauptziele: Kein Auftrag bleibt unabgerechnet, und es wird sichtbar, welche Firmen nur Vergleichsangebote einholen.

## Plattform

- Web-App unter `crm.screen-box.de`, für Suchmaschinen gesperrt (`noindex`, `robots.txt`).
- Next.js, Tailwind CSS, shadcn/ui. Datenbank MySQL auf Hostinger.
- Hosting auf dem bestehenden Hostinger-Konto (Node.js-App, Deployment aus diesem GitHub-Repo). Auf dem Konto liegen auch screen-box.de und jetztfotoboxmieten.de; die App bleibt in ihrem eigenen Ordner.
- Ein Nutzer, mehrere Geräte (Mac, Handy).
- Login mit Microsoft (Entra ID), nur Konten aus dem eigenen Tenant, die ausdrücklich freigegeben sind.
- Zugangsdaten (Lexware-Schlüssel, Microsoft-Secret, Datenbank) nur als Umgebungsvariablen auf dem Server, nie im Repo.

## Datenmodell

**Firma**: Name (wie in Lexware), Ordnername für die Projektordner (z. B. `EUROWINGS` für Eurowings GmbH), Adresse, Website, Branche, Lexware-Kontakt-ID, Notiz.

**Kontakt**: Name, E-Mail, Telefon, Position, Firma.

**Vorgang**: eine Anfrage bzw. ein Auftrag einer Firma.

- Interne Nummer `JJJJ-NNN`, vergeben beim Wechsel auf „Beauftragt“. Sie kommt in Lexware ins Referenzfeld von Angebot und Rechnung.
- Projektname, Projektdatum, Betrag netto, Angebotsnummer, Rechnungsnummer, PDF-Anhänge.
- Markierung „vermutlich nur Vergleichsangebot“.
- Phasen:

  ```
  Anfrage → Angebot verschickt → Beauftragt → Erledigt → Rechnung gestellt → Bezahlt
                                                      ↘ Abgelehnt / Verloren
  ```

- Beim Abschluss als „Abgelehnt / Verloren“ ist ein Grund Pflicht (Preis, nur Vergleichsangebot, Timing, Wettbewerber, keine Rückmeldung, Sonstiges) plus Notiz.
- Schnellauftrag: Vorgang startet direkt bei „Beauftragt“ (Firma, Beschreibung, Datum), gedacht fürs Handy direkt nach einem Anruf.

**Aufgabe**: Titel, Fälligkeit, optional Firma oder Vorgang, erledigt ja/nein. Automatisch angelegt werden:

- Angebot verschickt → nach 10 Tagen „Nachfassen“
- Vorgang auf „Erledigt“ → sofort „Rechnung stellen“
- Rechnung gestellt → nach 14 Tagen ohne Zahlung „Zahlung prüfen“

**Aktivität**: Einträge der Zeitleiste (Mail, Notiz, Anruf, Phasenwechsel).

## Ansichten

- **Start**: Heute zu tun, Offen zur Abrechnung, Angebote nachfassen, neue nicht zugeordnete Mails.
- **Vorgänge**: Kanban-Board nach Phasen (Drag & Drop), umschaltbar auf Tabelle.
- **Firma**: Kennzahlen oben (Anfragen gesamt, davon beauftragt, Umsatz, Anteil Vergleichsangebote, letzter Kontakt), Stammdaten, Zeitleiste, Vorgänge, Kontakte. Anrufnotiz mit einem Klick, daraus direkt ein Schnellauftrag.
- **Kontakte**, **Posteingang**, **Aufgaben**, **Auswertungen**.
- Am Handy: untere Leiste mit „+“ für den Schnellauftrag.

## Design

Angelehnt an screen-box.de: Schrift Inter, Hintergrund `#F5F5F7`, fast schwarze runde Buttons (`#1D1D1F`), Akzent Orange `#E84A14`. Orange nur für Dinge, die Handeln verlangen (überfällig, nicht abgerechnet). Aufbau wie HubSpot mit linker Seitenleiste. Heller und dunkler Modus.

## E-Mail (Microsoft 365)

- Postfächer: `office@screen-box.de` (Benutzerpostfach) und `hello@screen-box.de` (freigegebenes Postfach).
- Zugriff über Microsoft Graph, App-Registrierung mit `Mail.Read`, per Zugriffsrichtlinie auf diese zwei Postfächer beschränkt.
- Nur lesen. Gesendet wird weiter aus Outlook.
- Zuordnung über Absenderadresse (Kontakt) und Absender-Domain (Firma). Unbekannte Absender landen im Posteingang und werden mit einem Klick zugeordnet. Neue Personen einer bekannten Domain werden als Kontakt vorgeschlagen.
- Beim Start werden die letzten 12 Monate eingelesen.
- Aus jeder Mail lässt sich mit einem Klick eine Aufgabe oder ein Vorgang anlegen. Firma, Kontakt und Betreff werden übernommen, die Mail hängt danach in der Zeitleiste des Vorgangs.

## Lexware Office

- Public API (`api.lexware.io`), Schlüssel mit vollen Rechten.
- Version 1 liest nur: Kontakte (Import), Angebote, Rechnungen, Zahlungsstatus.
- Später schreibend, aber nur auf Klick und nur als Entwurf: Angebote anlegen, Belege hochladen. Abschließen und Versenden passiert immer in Lexware.

## Erinnerungen

Jeden Montagmorgen eine Mail an office@, nur wenn etwas offen ist:

- erledigt, aber nicht abgerechnet
- seit mehr als 14 Tagen in „Beauftragt“
- Angebot seit mehr als 10 Tagen ohne Rückmeldung
- fällige und überfällige Aufgaben

## Projektordner (Stufe 5)

Ein kleiner Helfer auf dem Mac legt auf Knopfdruck aus der App die Ordner an. Ziel wählbar: `~/Projekte` oder `/Volumes/SANDISK 4TB/Projekte`.

```
<Root>/<Ordnername der Firma>/
├── 01 corporate/
└── <JJJJ-MM-TT> <Projektname>/
    ├── 01 RAW FOOTAGE/
    │   ├── 01 Video/
    │   ├── 02 Foto/
    │   ├── 03 Drohne/
    │   └── 04 AUDIO/
    ├── 02 AUDIO/
    ├── 03 MUSIK/
    ├── 04 INSERTS/
    │   ├── Video/
    │   ├── pdf/
    │   ├── Audio/
    │   └── Bilder/
    ├── 05 Downloads/
    └── 06 Exports/
        ├── Fotos/
        ├── Videos/
        └── 9x16/
```

Die Vorlage ist in der App einstellbar. Bestehende Ordner werden nie verändert.

## Produktionsplanung und Kalender

- Beim Verschieben auf „Beauftragt“ (und nach einem Schnellauftrag) öffnet sich „Produktion planen“, mit „Später“ überspringbar; danach Karte „Termine“ im Vorgang.
- Produktion: Drehort (siehe Adresssuche), pro Tag Datum und Uhrzeit, „+“ für den Folgetag, optional „durchgehend blocken“.
- Postproduktion: Start- und Zieltag ohne Uhrzeit, Vorschlag nächster Arbeitstag nach dem letzten Drehtag. Nicht im Kalender.
- Kalender von office@ (Microsoft Graph, Exchange-RBAC „Application Calendars.ReadWrite“ nur für office@): je Drehtag ein Termin bzw. ein durchgehender, Erinnerung am Vortag 18 Uhr, als „Gebucht“. Das CRM führt; Verlieren oder Entfernen löscht Termine. Fehlgeschlagene Abgleiche wiederholt der Cronjob.
- Projektdatum folgt dem ersten Drehtag. Seite „Planung“ (Zeitleiste über 8 Wochen) und „Nächste Produktionstage“ auf der Startseite.

## Adresssuche (Google Places)

- Drehort: Vorschläge zuerst aus eigenen Daten (Firmenadresse des Kunden, frühere Drehorte), ab drei Buchstaben und kurzer Tipppause auch von Google. Freitext bleibt erlaubt („ohne Karte“).
- Ausgewählte Orte speichern Straße, PLZ, Ort, Land und Koordinaten am Vorgang. Der Kalendertermin bekommt Adresse und Koordinaten (Karte und Navigation in Outlook und auf dem iPhone) und einen Link „Route in Google Maps“; Planung und Startseite verlinken zu Google Maps.
- „Adresse suchen“ auch bei Neue Firma, Firma bearbeiten und Kontakt aus Mail: füllt Straße, PLZ, Ort und leere Felder wie Name und Website. Nichts geht an Lexware.
- Google Places API (New), Projekt screen-box, Schlüssel nur serverseitig (`GOOGLE_PLACES_KEY`, im Schlüsselbund „CRM SCREEN-BOX – Google Places“), beschränkt auf die Server-IPs und auf Places API (New).
- Kostenschutz: nur Essentials-Felder (Adresse, Koordinaten; Name aus dem Vorschlag), Website (Enterprise) nur bei leerem Feld. Google-Kontingente 300 Autocomplete und 100 GetPlace pro Tag, Budget 1 € mit Ausgabenobergrenze und Mails, CRM-eigene Grenzen 250 Abfragen pro Tag und 300 Website-Abfragen pro Monat. Ist eine Grenze erreicht, gibt es nur noch eigene Vorschläge.

## Kundeneinschätzung und Wettbewerber

- Firmen haben eine Art: Kunde, Dienstleister oder Wettbewerber.
- Beim Verlieren eines Vorgangs optional „Wer hat den Auftrag bekommen?“; ein neuer Name legt einen Wettbewerber an. Nachtragen im Vorgang jederzeit.
- 0–5 Sterne je Firma. Vorschlag der App ab 3 Angeboten nach RFM-Gedanke: 50 % geglättete Annahmequote (angenommen + 1) / (entschieden + 2), 35 % Umsatz-Rang laut Lexware, 15 % Aktualität des letzten Auftrags. Angebote mit daraus entstandener Rechnung gelten als angenommen. Eigene Bewertung schlägt den Vorschlag; 0 Sterne („keine Angebote mehr“) nur von Hand, mit Begründung.
- Firmenseite: Karte „Einschätzung“ mit Sternen, „x von y Angeboten angenommen“, Umsatz, letzter Auftrag, Wettbewerber, Mails und Anrufe.
- Hinweise bei neuen Anfragen (Posteingang, neuer Vorgang, Vorgang): deutlich bei 0 Sternen, dezent bei 1–2 Sternen.
- Firmenliste mit Sterne-Spalte, Sortierung und Filter; eigene Seite „Wettbewerber“.

## Ideen für später

- Alte Domain bergander-film.de (ebenfalls Microsoft 365): Wer dorthin schreibt, bekommt automatisch einen Hinweis, künftig office@screen-box.de zu verwenden. Lässt sich voraussichtlich ohne CRM direkt in Exchange lösen (automatische Antwort bzw. Transportregel).
- Alte Kontakte aus der bergander-film.de-Zeit sichten und übernehmen, z. B. über eine Liste früherer Mail-Partner, die noch nicht im CRM stehen.

## Stufen

| Stufe | Inhalt |
|---|---|
| 0 | Design-Entwürfe, Server, Subdomain, Login mit Microsoft |
| 1 | Firmen, Kontakte, Vorgänge mit Pipeline, Schnellauftrag, Aufgaben, Absagegründe, Import der Lexware-Kontakte |
| 2 | Mails einlesen und zuordnen, Posteingang, Zeitleiste, aus Mails Aufgaben und Vorgänge erstellen |
| 3 | Montags-Mail, Lexware-Abgleich (Angebot, Rechnung, bezahlt) |
| 4 | Auswertungen |
| 5 | Ordner-Helfer, Angebote als Entwurf in Lexware, Belege hochladen |
