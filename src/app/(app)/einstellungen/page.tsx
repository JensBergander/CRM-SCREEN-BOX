import { LexwareImport } from "@/components/lexware-import";
import { Card, PageHeader } from "@/components/ui";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Einstellungen" />
      <Card title="Lexware Office" className="max-w-2xl">
        <LexwareImport configured={!!process.env.LEXWARE_API_KEY} />
      </Card>
    </div>
  );
}
