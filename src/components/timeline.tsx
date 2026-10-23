import { ArrowRightLeft, Mail, MessageSquare, Phone } from "lucide-react";
import type { Activity } from "@/db/schema";
import { relativeTime } from "@/lib/format";
import { Empty } from "./ui";

const ICON = { notiz: MessageSquare, anruf: Phone, phase: ArrowRightLeft, mail: Mail };
const LABEL = { notiz: "Notiz", anruf: "Anruf", phase: "Phase", mail: "Mail" };

export function Timeline({ items }: { items: Activity[] }) {
  if (!items.length) return <Empty>Noch keine Einträge.</Empty>;
  return (
    <ol>
      {items.map((item) => {
        const Icon = ICON[item.type];
        return (
          <li key={item.id} className="flex gap-3.5 border-t border-line-soft px-5 py-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-muted">
              <Icon size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {LABEL[item.type]} · {relativeTime(item.createdAt)}
              </p>
              <p className="whitespace-pre-line text-sm">{item.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
