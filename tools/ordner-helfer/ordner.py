#!/usr/bin/env python3
"""Legt Projektordner für das CRM an. Wird von „CRM Ordner.app“ aufgerufen.

  ordner.py roots              -> verfügbare Ziele, eines pro Zeile („Name<TAB>Pfad“)
  ordner.py create URL ROOT    -> legt die Ordner an und gibt den Projektpfad aus

URL: screenbox-ordner://anlegen?firma=EUROWINGS&projekt=2026-07-31 Lichtkonzept&vorlage=01 RAW FOOTAGE/01 Video|...
Bestehende Ordner werden nie verändert: Gibt es den Projektordner schon, wird er nur geöffnet.
"""
import os
import re
import sys
from urllib.parse import parse_qs, urlparse

# Ziele zur Auswahl; ein Ziel erscheint nur, wenn sein Laufwerk vorhanden ist
ROOTS = [
    ("Mac (Projekte)", os.path.expanduser("~/Projekte"), os.path.expanduser("~")),
    ("SSD SANDISK 4TB", "/Volumes/SANDISK 4TB/Projekte", "/Volumes/SANDISK 4TB"),
]


def clean(part: str) -> str:
    part = re.sub(r"[/:\\\x00-\x1f]", "-", part).strip().strip(".")
    if not part:
        raise ValueError("leerer oder ungültiger Ordnername")
    return part


def roots() -> None:
    for name, path, volume in ROOTS:
        if os.path.isdir(volume):
            print(f"{name}\t{path}")


def create(url: str, root: str) -> None:
    if root not in [path for _, path, _ in ROOTS]:
        raise ValueError("unbekanntes Ziel")
    query = parse_qs(urlparse(url).query)
    company = clean(query.get("firma", [""])[0])
    project = clean(query.get("projekt", [""])[0])
    template = [
        [clean(p) for p in line.split("/") if p.strip()]
        for line in query.get("vorlage", [""])[0].split("|")
        if line.strip()
    ]

    company_dir = os.path.join(root, company)
    project_dir = os.path.join(company_dir, project)
    os.makedirs(os.path.join(company_dir, "01 corporate"), exist_ok=True)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)
        for parts in template:
            os.makedirs(os.path.join(project_dir, *parts), exist_ok=True)
    print(project_dir)


if __name__ == "__main__":
    try:
        if sys.argv[1] == "roots":
            roots()
        elif sys.argv[1] == "create":
            create(sys.argv[2], sys.argv[3])
    except Exception as error:  # Meldung landet im Dialog der App
        print(f"FEHLER: {error}", file=sys.stderr)
        sys.exit(1)
