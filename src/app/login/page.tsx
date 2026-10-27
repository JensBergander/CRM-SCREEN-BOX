const MESSAGES: Record<string, string> = {
  abgelaufen: "Die Anmeldung ist abgelaufen. Bitte noch einmal versuchen.",
  microsoft: "Microsoft hat die Anmeldung nicht bestätigt.",
  "nicht-freigegeben": "Dieses Konto ist für das CRM nicht freigegeben.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { fehler } = await searchParams;
  const message = typeof fehler === "string" ? MESSAGES[fehler] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-ink">
          <span className="h-4 w-4 rounded-full bg-accent" />
        </div>
        <h1 className="text-xl font-bold">SCREEN-BOX CRM</h1>
        <p className="mt-2 text-sm text-muted">Anmeldung mit deinem Microsoft-Konto</p>

        {message && (
          <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
            {message}
          </p>
        )}

        <a
          href="/api/auth/login"
          className="mt-8 flex min-h-12 items-center justify-center gap-3 rounded-full bg-ink px-6 text-sm font-semibold text-surface"
        >
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Mit Microsoft anmelden
        </a>
      </div>
    </main>
  );
}
