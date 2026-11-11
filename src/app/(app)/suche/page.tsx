import Link from "next/link";
import { Building2, FileText, Mail, MessageSquare, Phone, User } from "lucide-react";
import { relativeTime, tidyMailText } from "@/lib/format";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { searchAll, searchMailsAndNotes, type SearchHit } from "@/lib/search";
import { KIND_LABEL, KIND_TONE, TONE_SOFT } from "@/lib/tones";
import { SearchBox } from "@/components/search-box";
import { Card, Empty, PageHeader } from "@/components/ui";

function HitRow({ hit }: { hit: SearchHit }) {
  const Icon = hit.kind === "firma" ? Building2 : hit.kind === "kontakt" ? User : FileText;
  return (
    <Link href={hit.href} className="flex min-h-12 items-center gap-3 border-t border-line-soft px-5 py-2.5 hover:bg-bg">
      <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{hit.title}</span>
        {(hit.sub || hit.stage) && (
          <span className="block truncate text-xs text-muted">
            {hit.stage && <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STAGE_DOT[hit.stage]}`} aria-hidden="true" />}
            {[hit.sub, hit.stage && STAGE_LABEL[hit.stage]].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {hit.approx && <span className="shrink-0 text-[11px] text-muted">ähnlich</span>}
      {hit.companyKind && (
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE_SOFT[KIND_TONE[hit.companyKind]]}`}>{KIND_LABEL[hit.companyKind]}</span>
      )}
    </Link>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/suche">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const [hits, found] = query.length >= 2 ? await Promise.all([searchAll(query, 30), searchMailsAndNotes(query)]) : [null, null];
  const groups = hits ? ([["Firmen", hits.firmen], ["Kontakte", hits.kontakte], ["Vorgänge", hits.vorgaenge]] as const) : [];
  const total = hits && found ? hits.firmen.length + hits.kontakte.length + hits.vorgaenge.length + found.mails.length + found.notes.length : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Suche" sub={query.length >= 2 ? `${total} Treffer für „${query}“` : "Mindestens zwei Zeichen eingeben"}>
        <SearchBox defaultValue={query} placeholder="Firma, Kontakt, Vorgang, Mail oder Notiz" />
      </PageHeader>

      {hits && found && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-5">
          {groups.map(([title, list]) => (
            <Card key={title} title={title} aside={list.length > 0 && <span className="text-xs text-muted">{list.length}</span>}>
              {list.length ? list.map((hit) => <HitRow key={hit.href} hit={hit} />) : <Empty>Nichts gefunden.</Empty>}
            </Card>
          ))}

          <Card title="Mails" aside={found.mails.length > 0 && <span className="text-xs text-muted">{found.mails.length === 30 ? "neueste 30" : found.mails.length}</span>}>
            {found.mails.length === 0 && <Empty>Keine Mail gefunden.</Empty>}
            {found.mails.map((m) => (
              <Link
                key={m.id}
                href={m.dealId ? `/vorgaenge/${m.dealId}` : m.companyId ? `/firmen/${m.companyId}` : `/posteingang?ansicht=alle&q=${encodeURIComponent(query)}`}
                className="flex gap-3 border-t border-line-soft px-5 py-3 hover:bg-bg"
              >
                <Mail size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted">
                    {m.outgoing ? `an ${m.toAddresses?.split(",")[0] ?? ""}` : `von ${m.fromName ?? m.fromAddress}`} · {relativeTime(m.receivedAt)}
                    {m.company && ` · ${m.company.trim()}`}
                  </span>
                  <span className="block truncate text-sm font-semibold">{m.subject || "(ohne Betreff)"}</span>
                  {m.preview && <span className="line-clamp-2 text-[13px] text-muted">{tidyMailText(m.preview)}</span>}
                </span>
              </Link>
            ))}
          </Card>

          <Card title="Notizen und Anrufe" aside={found.notes.length > 0 && <span className="text-xs text-muted">{found.notes.length === 30 ? "neueste 30" : found.notes.length}</span>}>
            {found.notes.length === 0 && <Empty>Keine Notiz gefunden.</Empty>}
            {found.notes.map((n) => {
              const Icon = n.type === "anruf" ? Phone : MessageSquare;
              return (
                <Link
                  key={n.id}
                  href={n.dealId ? `/vorgaenge/${n.dealId}` : n.companyId ? `/firmen/${n.companyId}` : "/"}
                  className="flex gap-3 border-t border-line-soft px-5 py-3 hover:bg-bg"
                >
                  <Icon size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-muted">
                      {n.type === "anruf" ? "Anruf" : "Notiz"} · {relativeTime(n.createdAt)}
                      {[n.company?.trim(), n.deal].filter(Boolean).map((s) => ` · ${s}`)}
                    </span>
                    <span className="line-clamp-3 whitespace-pre-line text-sm">{n.body}</span>
                  </span>
                </Link>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
