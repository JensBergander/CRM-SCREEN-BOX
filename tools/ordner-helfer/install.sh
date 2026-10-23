#!/bin/bash
# Baut „CRM Ordner.app“ nach ~/Applications und meldet das Link-Schema screenbox-ordner:// an.
set -euo pipefail
cd "$(dirname "$0")"
APP="$HOME/Applications/CRM Ordner.app"

rm -rf "$APP"
mkdir -p "$HOME/Applications"
osacompile -o "$APP" main.applescript
cp ordner.py "$APP/Contents/Resources/ordner.py"

PLIST="$APP/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "de.screen-box.crm-ordner" "$PLIST"
plutil -replace LSUIElement -bool true "$PLIST"
plutil -replace CFBundleURLTypes -json '[{"CFBundleURLName":"CRM Ordner","CFBundleURLSchemes":["screenbox-ordner"]}]' "$PLIST"

codesign --force --deep --sign - "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "Installiert: $APP"
