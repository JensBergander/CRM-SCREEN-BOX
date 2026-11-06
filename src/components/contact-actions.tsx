import type { CallTarget } from "@/lib/queries";
import { CallAction, MailAction } from "./call-menu";

const iconLink =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-ink hover:bg-ink hover:text-surface";

// Telefon- und Mail-Knopf: zeigen die Nummern bzw. Adressen der Ansprechpartner zur Auswahl
export function ContactActions({ call }: { call: CallTarget }) {
  return (
    <span className="flex gap-1.5">
      <CallAction target={call} className={iconLink} />
      <MailAction target={call} className={iconLink} />
    </span>
  );
}
