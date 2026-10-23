import { asc } from "drizzle-orm";
import { db } from "@/db";
import { mailIgnore } from "@/db/schema";
import { LexwareImport } from "@/components/lexware-import";
import { DigestButton, FolderTemplateForm, LexwareSyncButton } from "@/components/settings-actions";
import { folderTemplate } from "@/lib/folders";
import { btnQuiet, Card, Empty, PageHeader, Row } from "@/components/ui";
import { removeIgnoreAction } from "../actions";

export default async function SettingsPage() {
  const ignored = await db.select().from(mailIgnore).orderBy(asc(mailIgnore.pattern));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Einstellungen" />
      <Card title="Lexware Office" className="max-w-2xl">
        <LexwareImport configured={!!process.env.LEXWARE_API_KEY} />
        <p className="px-5 pb-2 text-sm text-muted">
          Angebote und Rechnungen werden alle 15 Minuten abgeglichen. Eindeutige Fälle verknüpft die App selbst und setzt die Phase
          weiter (Rechnung gestellt, Bezahlt).
        </p>
        <LexwareSyncButton />
      </Card>
      <Card title="Montags-Mail" className="max-w-2xl">
        <DigestButton />
      </Card>
      <Card title="Vorlage für Projektordner" className="max-w-2xl">
        <FolderTemplateForm template={await folderTemplate()} />
      </Card>
      <Card
        title="Ignorierte Absender"
        aside={<span className="text-xs text-muted">Mails von hier landen nicht im Posteingang</span>}
        className="max-w-2xl"
      >
        {ignored.length === 0 && <Empty>Noch keine. Im Posteingang über „Absender immer ignorieren“ hinzufügen.</Empty>}
        {ignored.map((rule) => (
          <Row key={rule.id}>
            <span className="flex-1 text-sm">{rule.pattern.includes("@") ? rule.pattern : `alle von @${rule.pattern}`}</span>
            <form action={removeIgnoreAction.bind(null, rule.id)}>
              <button type="submit" className={btnQuiet}>Wieder zulassen</button>
            </form>
          </Row>
        ))}
      </Card>
    </div>
  );
}
