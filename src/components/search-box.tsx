import { Search } from "lucide-react";

// Einfaches GET-Formular, die Seite filtert über ?q=
export function SearchBox({ defaultValue, placeholder }: { defaultValue?: string; placeholder: string }) {
  return (
    <form role="search" className="flex min-h-11 flex-[0_1_340px] items-center gap-2 rounded-full border border-line bg-surface px-4 text-muted">
      <Search size={16} aria-hidden="true" />
      <label className="sr-only" htmlFor="q">Suchen</label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-ink outline-none"
      />
    </form>
  );
}
