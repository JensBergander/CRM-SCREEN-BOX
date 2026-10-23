#!/bin/bash
# Nächtliche Sicherung der CRM-Datenbank auf dem Hostinger-Server (per Cronjob).
# Zugangsdaten stehen in ~/.crm-backup.cnf (chmod 600), nie in diesem Skript.
set -euo pipefail
DIR="$HOME/crm-backups"
KEEP_DAYS=30
mkdir -p "$DIR"
FILE="$DIR/crm-$(date +%Y-%m-%d_%H%M).sql.gz"

nice -n 10 mariadb-dump --defaults-extra-file="$HOME/.crm-backup.cnf" \
  --single-transaction --quick --skip-lock-tables u854230355_crm | gzip -9 > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

# Ältere Sicherungen löschen
find "$DIR" -name 'crm-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
