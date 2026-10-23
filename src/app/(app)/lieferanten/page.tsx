import { ProviderPage } from "@/components/provider-page";

export default async function SuppliersPage({ searchParams }: PageProps<"/lieferanten">) {
  return <ProviderPage kind="lieferant" params={await searchParams} />;
}
