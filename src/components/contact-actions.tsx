import { Mail } from "lucide-react";
import type { CallTarget } from "@/lib/queries";
import { CallAction } from "./call-menu";

const iconLink =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-ink hover:bg-ink hover:text-surface";

// Telefon- und Mail-Knopf; fehlt eine Mail, bleibt der Platz leer, damit Spalten bündig sind
export function ContactActions({ name, call, email }: { name: string; call: CallTarget; email?: string | null }) {
  return (
    <span className="flex gap-1.5">
      <CallAction target={call} className={iconLink} />
      {email ? (
        <a href={`mailto:${email}`} aria-label={`Mail an ${name}: ${email}`} title={email} className={iconLink}>
          <Mail size={16} aria-hidden="true" />
        </a>
      ) : (
        <span className="h-9 w-9" />
      )}
    </span>
  );
}
