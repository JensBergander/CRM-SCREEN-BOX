import { ProviderPage } from "@/components/provider-page";

export default async function ServicesPage({ searchParams }: PageProps<"/dienstleister">) {
  return <ProviderPage kind="dienstleister" params={await searchParams} />;
}
