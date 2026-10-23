import { NewCompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";

export default function NewCompanyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Neue Firma" />
      <NewCompanyForm />
    </div>
  );
}
