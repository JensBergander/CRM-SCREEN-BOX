import { asc } from "drizzle-orm";
import { db } from "@/db";
import { mailIgnore } from "@/db/schema";
import { DuplicateList, LexwareImport } from "@/components/lexware-import";
import { duplicates, lastContactSync } from "@/lib/lexware";
import { AutoReplyForm, DigestButton, FolderTemplateForm, LexwareSyncButton, ServiceTagsForm } from "@/components/settings-actions";
import { serviceTagOptions } from "@/lib/service-tags";
import { autoReplyCount, autoReplySettings } from "@/lib/autoreply";
import { folderTemplate } from "@/lib/folders";
import { btnQuiet, Card, Empty, PageHeader, Row } from "@/components/ui";
import { removeIgnoreAction } from "../actions";

export default async function SettingsPage() {
  const [ignored, dupes, lastSync] = await Promise.all([
    db.select().from(mailIgnore).orderBy(asc(mailIgnore.pattern)),
    duplicates(),
    lastContactSync(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader area="einstellungen" title="Einstellungen" />
      <Card title="Lexware Office" className="max-w-2xl">
        <LexwareImport configured={!!process.env.LEXWARE_API_KEY} lastSync={lastSync} />
        <p className="px-5 pb-2 text-sm text-muted">
          Angebote und Rechnungen werden alle 15 Minuten abgeglichen. Eindeutige Fälle verknüpft die App selbst und setzt die Phase
          weiter (Rechnung gestellt, Bezahlt).
        </p>
        <LexwareSyncButton />
      </Card>
      {dupes.length > 0 && (
        <Card
          title="Mögliche Dubletten"
          aside={<span className="text-xs text-muted">werden erst angelegt, wenn du entscheidest</span>}
          className="max-w-2xl"
        >
          <DuplicateList items={dupes} />
        </Card>
      )}
      <Card title="Montags-Mail" className="max-w-2xl">
        <DigestButton />
      </Card>
      <Card title="Automatische Antwort für alte Adressen" className="max-w-2xl">
        <AutoReplyForm settings={await autoReplySettings()} sent={await autoReplyCount()} />
      </Card>
      <Card title="Gewerke für Dienstleister" className="max-w-2xl">
        <ServiceTagsForm tags={await serviceTagOptions()} />
      </Card>
      <Card title="Kategorien für Lieferanten" className="max-w-2xl">
        <ServiceTagsForm kind="lieferant" tags={await serviceTagOptions("lieferant")} />
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
