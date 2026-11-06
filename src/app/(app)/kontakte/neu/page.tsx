import { companyOptions } from "@/lib/queries";
import { BackButton } from "@/components/back-button";
import { NewPersonForm } from "@/components/person-forms";
import { PageHeader } from "@/components/ui";

export default async function NewContactPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackButton fallback="/kontakte" label="Kontakte" />
      <PageHeader area="kontakte" title="Neuer Kontakt" sub="Ein Name genügt, alles andere kannst du später ergänzen" />
      <NewPersonForm companies={await companyOptions()} />
    </div>
  );
}
