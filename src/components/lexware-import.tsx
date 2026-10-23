"use client";

import { useState, useTransition } from "react";
import { importLexwareAction } from "@/app/(app)/actions";
import type { ImportResult } from "@/lib/lexware";
import { btnPrimary, FormError } from "./ui";

export function LexwareImport({ configured }: { configured: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | { error: string } | null>(null);

  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
      <p className="text-sm text-muted">
        Holt alle Kunden aus Lexware Office und legt sie als Firmen mit Ansprechpartnern an. Bereits importierte Firmen
        werden nur aktualisiert; was du hier selbst eingetragen hast (Ordnername, Notizen, Mail-Domain), bleibt erhalten.
        Archivierte Kunden werden übersprungen.
      </p>
      {!configured && <FormError message="Der Lexware-Schlüssel (LEXWARE_API_KEY) ist auf dem Server noch nicht hinterlegt." />}
      <div>
        <button
          type="button"
          disabled={pending || !configured}
          onClick={() => startTransition(async () => setResult(await importLexwareAction()))}
          className={btnPrimary}
        >
          {pending ? "Importiert …" : "Kunden aus Lexware importieren"}
        </button>
      </div>
      {result && "error" in result && <FormError message={result.error} />}
      {result && !("error" in result) && (
        <p role="status" className="rounded-xl bg-bg px-4 py-3 text-sm">
          {result.created} Firmen neu, {result.updated} aktualisiert, {result.contacts} Kontakte angelegt
          {result.skipped > 0 && `, ${result.skipped} archivierte übersprungen`}.
        </p>
      )}
    </div>
  );
}
