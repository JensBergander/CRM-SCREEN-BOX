import { ArrowRightLeft, Mail, MailOpen, MessageSquare, Paperclip, Phone } from "lucide-react";
import type { Activity, Email } from "@/db/schema";
import { relativeTime } from "@/lib/format";
import { Empty } from "./ui";

const ICON = { notiz: MessageSquare, anruf: Phone, phase: ArrowRightLeft, mail: Mail };
const LABEL = { notiz: "Notiz", anruf: "Anruf", phase: "Phase", mail: "Mail" };

type Item =
  | { kind: "activity"; at: Date; activity: Activity }
  | { kind: "email"; at: Date; email: Email };

// Notizen, Anrufe, Phasenwechsel und Mails in einer Zeitleiste, neueste zuerst
export function Timeline({ items, emails = [] }: { items: Activity[]; emails?: Email[] }) {
  const merged: Item[] = [
    ...items.map((activity) => ({ kind: "activity" as const, at: activity.createdAt, activity })),
    ...emails.map((email) => ({ kind: "email" as const, at: email.receivedAt, email })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  if (!merged.length) return <Empty>Noch keine Einträge.</Empty>;
  return (
    <ol>
      {merged.map((item) => {
        if (item.kind === "email") {
          const mail = item.email;
          const Icon = mail.outgoing ? MailOpen : Mail;
          return (
            <li key={`m${mail.id}`} className="flex gap-3.5 border-t border-line-soft px-5 py-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info-ink">
                <Icon size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  {mail.outgoing ? `Mail an ${mail.toAddresses?.split(",")[0]}` : `Mail von ${mail.fromName ?? mail.fromAddress}`} ·{" "}
                  {relativeTime(mail.receivedAt)}
                  {mail.hasAttachments && <Paperclip size={12} className="ml-1 inline" aria-label="mit Anhang" />}
                </p>
                <p className="text-sm font-semibold">
                  {mail.webLink ? (
                    <a href={mail.webLink} target="_blank" rel="noreferrer" className="hover:underline">
                      {mail.subject || "(ohne Betreff)"}
                    </a>
                  ) : (
                    mail.subject || "(ohne Betreff)"
                  )}
                </p>
                {mail.preview && <p className="line-clamp-2 text-[13px] text-muted">{mail.preview}</p>}
              </div>
            </li>
          );
        }
        const a = item.activity;
        const Icon = ICON[a.type];
        return (
          <li key={`a${a.id}`} className="flex gap-3.5 border-t border-line-soft px-5 py-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-muted">
              <Icon size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {LABEL[a.type]} · {relativeTime(a.createdAt)}
              </p>
              <p className="whitespace-pre-line text-sm">{a.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
