import { redirect } from "next/navigation";

// Dienstleister sind in den Lieferanten aufgegangen; alte Links und Lesezeichen landen dort
export default async function ServicesPage({ searchParams }: PageProps<"/dienstleister">) {
  const { gewerk } = await searchParams;
  redirect(typeof gewerk === "string" && gewerk ? `/lieferanten?kategorie=${encodeURIComponent(gewerk)}` : "/lieferanten");
}
