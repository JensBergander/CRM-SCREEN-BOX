import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { NavTracker } from "@/components/back-button";
import { SearchPalette } from "@/components/global-search";
import { displayName } from "@/lib/profile";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <NavTracker />
      <SearchPalette />
      <Sidebar userName={(await displayName(user)) ?? user.email} />
      <main className="min-w-0 flex-1 px-4 py-8 md:px-10">{children}</main>
    </div>
  );
}
