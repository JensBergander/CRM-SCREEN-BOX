"use client";

import { useState, useTransition } from "react";
import { History } from "lucide-react";
import { loadOlderMailsAction } from "@/app/(app)/actions";

// Mails, die älter sind als der laufende Abruf (ein Jahr), gezielt für diese Firma holen
export function OlderMails({ companyId }: { companyId: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string>();

  return (
    <div className="flex items-center gap-2 text-[13px]">
      {result && <span role="status" className="text-muted">{result}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await loadOlderMailsAction(companyId);
            setResult(r.error ? `Fehler: ${r.error}` : r.added ? `${r.added} Mail${r.added === 1 ? "" : "s"} nachgeladen` : "Keine weiteren Mails gefunden");
          })
        }
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-bg px-3.5 font-semibold hover:bg-line disabled:opacity-50"
      >
        <History size={14} aria-hidden="true" />
        {pending ? "Sucht …" : "Ältere Mails nachladen"}
      </button>
    </div>
  );
}
