import Link from "next/link";
import { mailboxes } from "@/lib/graph";
import { serviceTagOptions } from "@/lib/service-tags";
import { relativeTime } from "@/lib/format";
import { companyOptions, listInbox, mailState } from "@/lib/queries";
import { InboxList, SyncButton } from "@/components/inbox";
import { SearchBox } from "@/components/search-box";
import { Card, FormError, PageHeader } from "@/components/ui";

const VIEWS = { offen: "Ohne Zuordnung", alle: "Alle Mails", ignoriert: "Ignoriert" } as const;

export default async function InboxPage({ searchParams }: PageProps<"/posteingang">) {
  const { ansicht, q } = await searchParams;
  const view = ansicht === "alle" || ansicht === "ignoriert" ? ansicht : "offen";
  const query = typeof q === "string" && q.trim() ? q.trim() : undefined;
  const [rows, state, companies, tagOptions] = await Promise.all([listInbox(view, query), mailState(), companyOptions(), serviceTagOptions()]);
  const configured = mailboxes().length > 0;
  const lastError = state.syncs.find((s) => s.lastError);
  const lastRun = state.syncs.map((s) => s.lastRunAt).filter(Boolean).sort().at(-1);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        area="posteingang"
        title="Posteingang"
        sub={lastRun ? `Zuletzt abgerufen: ${relativeTime(lastRun)}` : configured ? "Noch nicht abgerufen" : undefined}
      >
        {configured && <SyncButton />}
      </PageHeader>

      {!configured && <FormError message="Es sind noch keine Postfächer eingerichtet (MAIL_MAILBOXES)." />}
      {lastError && <FormError message={`${lastError.mailbox}: ${lastError.lastError}`} />}

      <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Ansicht" className="flex w-fit rounded-full bg-line p-1">
        {Object.entries(VIEWS).map(([key, label]) => (
          <Link
            key={key}
            href={`/posteingang?${new URLSearchParams({ ...(key !== "offen" && { ansicht: key }), ...(query && { q: query }) })}`}
            aria-current={view === key ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-semibold ${view === key ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {label}
            {key === "offen" && state.open > 0 && <span className="ml-1.5 rounded-full bg-sales-soft px-2 text-sales-ink">{state.open}</span>}
          </Link>
        ))}
      </div>
        <SearchBox defaultValue={query} placeholder="Absender, Betreff, Text oder Firma" keep={{ ansicht: view === "offen" ? undefined : view }} />
        {query && (
          <span className="text-[13px] text-muted">
            {rows.length === 200 ? "mehr als 200" : rows.length} Treffer für „{query}“ ·{" "}
            <Link href={view === "offen" ? "/posteingang" : `/posteingang?ansicht=${view}`} className="underline">Suche zurücksetzen</Link>
          </span>
        )}
      </div>

      <Card>
        <InboxList rows={rows} companies={companies} tagOptions={tagOptions} />
      </Card>
    </div>
  );
}
