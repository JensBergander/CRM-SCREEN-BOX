import Link from "next/link";
import { notFound } from "next/navigation";
import { dateDe, todayIso } from "@/lib/format";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { fullName } from "@/lib/people";
import { callContexts, companyOptions, getPerson, peopleOfActivities, personCall, personTraces, pickPeople } from "@/lib/queries";
import { BackButton } from "@/components/back-button";
import { ContactActions } from "@/components/contact-actions";
import { ActivityForm } from "@/components/forms";
import { AddAffiliation, MergePerson, PersonEditor } from "@/components/person-forms";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { Card, Empty, LexwareBadge, Row } from "@/components/ui";

const TABS = { ueber: "Über", aktivitaeten: "Aktivitäten" } as const;

export default async function ContactPage({ params, searchParams }: PageProps<"/kontakte/[id]">) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: keyof typeof TABS = rawTab === "aktivitaeten" ? "aktivitaeten" : "ueber";
  if (!/^\d+$/.test(id)) notFound();
  const data = await getPerson(Number(id));
  if (!data) notFound();
  const { person, links } = data;
  const name = fullName(person);
  const active = links.filter((l) => !l.contact.endedAt);
  const former = links.filter((l) => l.contact.endedAt);

  // 📞 und ✉︎ über die erste aktuelle Firma: die Nummern der Person oben, darunter die übrigen der Firma
  const main = active[0] ?? links[0];
  const calls = await callContexts(active.map((l) => l.contact.companyId).filter((c): c is number => !!c));
  const ctx = main?.contact.companyId ? calls.get(main.contact.companyId) : undefined;
  const call = main && personCall(ctx, { ...main.contact, firstName: person.firstName, lastName: person.lastName, mobile: person.mobile });
  const traces = await personTraces(person.id);
  const activityCount = data.timeline.length + data.emails.length;

  const kpis = [
    { label: "Letzter Kontakt", value: data.lastContact ? dateDe(new Date(data.lastContact).toISOString()) : "–" },
    { label: "Vorgänge", value: String(data.deals.length) },
    { label: "Offene Aufgaben", value: String(data.tasks.filter((t) => !t.doneAt).length) },
  ];
  const tabLink = (key: keyof typeof TABS) => (key === "ueber" ? `/kontakte/${person.id}` : `/kontakte/${person.id}?tab=${key}`);

  return (
    <div className="flex flex-col gap-6">
      <BackButton fallback="/kontakte" label="Kontakte" />
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <p className="text-[13px] text-muted">
            {active.length
              ? active.map((l, i) => (
                  <span key={l.contact.id}>
                    {i > 0 && " · "}
                    {l.contact.position && `${l.contact.position} bei `}
                    {l.company ? (
                      <Link href={`/firmen/${l.company.id}`} className="font-semibold text-ink hover:underline">{l.company.name.trim()}</Link>
                    ) : (
                      "ohne Firma"
                    )}
                  </span>
                ))
              : "ohne aktuelle Firma"}
            {former.length > 0 && <> · früher: {former.map((l) => l.company?.name.trim() ?? "ohne Firma").join(", ")}</>}
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">{name}</h1>
        </div>
        {call && <ContactActions call={call} />}
        <PersonEditor
          person={person}
          links={links.map((l) => ({
            id: l.contact.id,
            companyName: l.company?.name.trim() ?? null,
            position: l.contact.position,
            email: l.contact.email,
            phone: l.contact.phone,
            fromLexware: l.contact.fromLexware,
            ended: !!l.contact.endedAt,
          }))}
          deletable={!traces.lexware && traces.count === 0}
        />
      </header>

      <nav aria-label="Bereiche" className="flex gap-1 border-b border-line">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((key) => (
          <Link
            key={key}
            href={tabLink(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {TABS[key]}
            {key === "aktivitaeten" && activityCount > 0 && <span className="ml-1.5 text-muted">{activityCount}</span>}
          </Link>
        ))}
      </nav>

      {tab === "ueber" ? (
        <>
          <section aria-label="Kennzahlen" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl bg-surface p-4">
                <p className="text-xs text-muted">{k.label}</p>
                <p className="mt-1 text-xl font-bold tracking-tight">{k.value}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <Card title="Firmen">
              {links.length === 0 && <Empty>Keiner Firma zugeordnet.</Empty>}
              {links.map((l) => (
                <Row key={l.contact.id}>
                  <div className={`min-w-0 flex-1 ${l.contact.endedAt ? "opacity-60" : ""}`}>
                    <p className="text-sm font-semibold">
                      {l.company ? <Link href={`/firmen/${l.company.id}`} className="hover:underline">{l.company.name.trim()}</Link> : "Ohne Firma"}
                      {l.lexware && <span className="ml-2"><LexwareBadge company={l.lexware} /></span>}
                      {l.contact.endedAt && <span className="ml-2 text-[11px] font-semibold text-muted">früher</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {[l.contact.position, l.contact.phone, l.contact.email].filter(Boolean).join(" · ") || "keine Angaben"}
                    </p>
                  </div>
                </Row>
              ))}
              <AddAffiliation personId={person.id} companies={await companyOptions()} />
              <MergePerson person={{ id: person.id, name }} />
            </Card>

            <div className="flex flex-col gap-5">
              <Card title="Persönlich">
                <Row>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Handy</p>
                    <p className="text-sm">{person.mobile ?? "–"}</p>
                  </div>
                </Row>
                <Row>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Notizen</p>
                    <p className="whitespace-pre-line text-sm">{person.notes ?? "–"}</p>
                  </div>
                </Row>
              </Card>

              {data.deals.length > 0 && (
                <Card title="Vorgänge" aside={<span className="text-xs text-muted">als Ansprechpartner</span>}>
                  {data.deals.map((d) => (
                    <Row key={d.id} href={`/vorgaenge/${d.id}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[d.stage]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{d.title}</p>
                        <p className="text-xs text-muted">{[d.companyName.trim(), STAGE_LABEL[d.stage]].filter(Boolean).join(" · ")}</p>
                      </div>
                    </Row>
                  ))}
                </Card>
              )}
            </div>
          </div>
        </>
      ) : (
        <Card title="Aktivitäten">
          <ActivityForm
            companyId={main?.contact.companyId ?? null}
            dealId={null}
            projects={ctx?.projects ?? []}
            numbers={call?.numbers ?? []}
            people={ctx ? pickPeople(ctx.staff) : [{ id: person.id, name }]}
            initialPeople={[person.id]}
          />
          <Timeline
            items={data.timeline}
            emails={data.emails}
            searchable
            today={todayIso()}
            peopleOf={await peopleOfActivities(data.timeline.map((a) => a.id))}
            tasks={{
              count: data.tasks.filter((t) => !t.doneAt).length,
              content: <TaskList tasks={data.tasks} today={todayIso()} empty="Keine Aufgaben mit dieser Person." />,
            }}
          />
        </Card>
      )}
    </div>
  );
}
