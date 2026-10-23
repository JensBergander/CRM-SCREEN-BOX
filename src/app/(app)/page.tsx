import { getCurrentUser } from "@/lib/auth";

const KPIS = [
  { label: "Offen zur Abrechnung", hint: "erledigt, noch keine Rechnung", dot: "bg-accent" },
  { label: "Angebote nachfassen", hint: "über 10 Tage ohne Antwort", dot: "bg-[#91CCF4]" },
  { label: "Laufende Projekte", hint: "in Phase Beauftragt", dot: "bg-ink" },
  { label: "Offene Angebote", hint: "Summe verschickter Angebote", dot: "bg-line" },
];

const SECTIONS = [
  { title: "Offen zur Abrechnung", empty: "Nichts offen. Alles abgerechnet." },
  { title: "Heute zu tun", empty: "Keine Aufgaben für heute." },
  { title: "Angebote nachfassen", empty: "Keine Angebote, die auf Antwort warten." },
  { title: "Neue Mails ohne Zuordnung", empty: "Die Mail-Anbindung folgt in Stufe 2." },
];

function greeting(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", { hour: "numeric", timeZone: "Europe/Berlin" }).format(date),
  );
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

export default async function StartPage() {
  const user = await getCurrentUser();
  const now = new Date();
  const firstName = user.name.split(" ")[0];
  const today = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(now);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="text-[13px] text-muted">{today}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">
          {greeting(now)}, {firstName}
        </h1>
      </header>

      <section aria-label="Kennzahlen" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-1.5 rounded-2xl bg-surface p-5">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <span className={`h-2 w-2 rounded-full ${kpi.dot}`} />
              {kpi.label}
            </div>
            <div className="text-3xl font-bold tracking-tight">0</div>
            <div className="text-xs text-muted">{kpi.hint}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-5">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl bg-surface py-2">
            <h2 className="px-5 pb-2 pt-4 text-base font-semibold">{section.title}</h2>
            <p className="border-t border-line-soft px-5 py-6 text-sm text-muted">{section.empty}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
