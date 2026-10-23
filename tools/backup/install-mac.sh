#!/bin/bash
# Richtet auf dem Mac den regelmäßigen Abruf der CRM-Sicherungen ein (alle 6 Stunden und beim Anmelden).
set -euo pipefail
cd "$(dirname "$0")"
BIN="$HOME/Library/Application Support/CRM SCREEN-BOX"
PLIST="$HOME/Library/LaunchAgents/de.screen-box.crm-backup.plist"

mkdir -p "$BIN" "$HOME/Library/LaunchAgents"
cp pull-to-mac.sh "$BIN/pull-to-mac.sh"
chmod 700 "$BIN/pull-to-mac.sh"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>de.screen-box.crm-backup</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$BIN/pull-to-mac.sh</string></array>
  <key>StartInterval</key><integer>21600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$BIN/fehler.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Eingerichtet: $PLIST"
