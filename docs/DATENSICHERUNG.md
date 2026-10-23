# Datensicherung

Nur die eigenen Einträge im CRM (Vorgänge, Notizen, Aufgaben, Zuordnungen, Ignorierliste, Ordnernamen) existieren ausschließlich in der Datenbank. Kunden, Belege und Mails lassen sich aus Lexware und Microsoft 365 neu holen.

## Wie gesichert wird

| Schicht | Wo | Wann | Aufbewahrung |
|---|---|---|---|
| Hostinger-Backups | hPanel → Dateien → Backups | täglich (laut Tarif) | laut Hostinger |
| Eigener Export | Server: `~/crm-backups/crm-JJJJ-MM-TT_HHMM.sql.gz` | täglich 3 Uhr (Cronjob im hPanel: `bash ~/crm-backup/backup.sh`) | 30 Tage |
| Kopie auf dem Mac | `~/Projekte/CRM-Backups/` | alle 6 Stunden und beim Anmelden (launchd `de.screen-box.crm-backup`) | 90 Tage |

- Skripte: [tools/backup/](../tools/backup/). Die Zugangsdaten liegen auf dem Server in `~/.crm-backup.cnf` (nur für den Besitzer lesbar), nicht im Repo.
- Auf dem Mac einrichten oder neu einrichten: `tools/backup/install-mac.sh`. Protokoll: `~/Projekte/CRM-Backups/abruf.log`.

## Zurückspielen

Immer zuerst in eine Testdatenbank einspielen und prüfen, nie direkt über die Live-Datenbank.

Lokal prüfen:

```bash
mysql -uroot -e "CREATE DATABASE crm_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gunzip -c ~/Projekte/CRM-Backups/crm-2026-10-23_1235.sql.gz | mysql -uroot crm_restore
mysql -uroot crm_restore -e "select count(*) from deals"
```

Live wiederherstellen (überschreibt den aktuellen Stand, vorher einen frischen Export ziehen):

```bash
ssh -p 65002 u854230355@82.25.96.197
bash ~/crm-backup/backup.sh                       # aktuellen Stand sichern
gunzip -c ~/crm-backups/<Datei>.sql.gz | mysql --defaults-extra-file=~/.crm-backup.cnf u854230355_crm
```

Einzelne gelöschte Datensätze lassen sich gezielt aus einer lokal eingespielten Sicherung herauskopieren, ohne den Rest zu überschreiben.
