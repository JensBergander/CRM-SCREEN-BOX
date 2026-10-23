#!/bin/bash
# Holt die Datenbank-Sicherungen vom Hostinger-Server auf den Mac (per launchd, siehe install-mac.sh).
set -euo pipefail
DEST="$HOME/Projekte/CRM-Backups"
KEEP_DAYS=90
mkdir -p "$DEST"

rsync -a --ignore-existing -e "ssh -p 65002 -o BatchMode=yes -o ConnectTimeout=20" \
  "u854230355@82.25.96.197:crm-backups/" "$DEST/"

find "$DEST" -name 'crm-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%Y-%m-%d %H:%M') ok, neueste: $(ls -t "$DEST"/crm-*.sql.gz | head -1 | xargs basename)" >> "$DEST/abruf.log"
