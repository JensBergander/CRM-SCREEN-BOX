import { Mail, Phone } from "lucide-react";

const iconLink =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-ink hover:bg-ink hover:text-surface";

// Telefon- und Mail-Knopf; fehlt eine Angabe, bleibt der Platz leer, damit Spalten bündig sind
export function ContactActions({ name, phone, email }: { name: string; phone?: string | null; email?: string | null }) {
  return (
    <span className="flex gap-1.5">
      {phone ? (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} aria-label={`${name} anrufen: ${phone}`} title={phone} className={iconLink}>
          <Phone size={16} aria-hidden="true" />
        </a>
      ) : (
        <span className="h-9 w-9" />
      )}
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
