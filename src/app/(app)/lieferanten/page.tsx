import { ProviderPage } from "@/components/provider-page";

export default async function SuppliersPage({ searchParams }: PageProps<"/lieferanten">) {
  return <ProviderPage params={await searchParams} />;
}
