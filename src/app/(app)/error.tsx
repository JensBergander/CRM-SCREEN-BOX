"use client";

import { btnPrimary } from "@/components/ui";

// Wird angezeigt, wenn eine Seite nicht geladen werden kann, z. B. weil die Datenbank beim Hoster ausgefallen ist.
// Im Live-Betrieb verbirgt Next.js die Fehlerursache, daher ein allgemeiner Hinweis.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 flex max-w-lg flex-col gap-4 rounded-3xl bg-surface p-8">
      <h1 className="text-xl font-bold">Diese Seite konnte gerade nicht geladen werden</h1>
      <p className="text-sm text-muted">
        Meist ist die Datenbank beim Hoster kurz nicht erreichbar. Deine Daten sind davon nicht betroffen und gesichert. Bitte in ein
        paar Minuten erneut versuchen. Bleibt der Fehler, gib Claude die Uhrzeit und die Seite durch.
      </p>
      {error.digest && <p className="text-xs text-muted">Fehlercode: {error.digest}</p>}
      <div>
        <button type="button" onClick={reset} className={btnPrimary}>Erneut versuchen</button>
      </div>
    </div>
  );
}
