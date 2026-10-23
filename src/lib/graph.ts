import "server-only";

// Zugriff auf Microsoft Graph mit den App-Berechtigungen der Entra-App (Client Credentials).
let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.ENTRA_CLIENT_ID ?? "",
        client_secret: process.env.ENTRA_CLIENT_SECRET ?? "",
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Microsoft-Anmeldung fehlgeschlagen: ${data.error_description ?? data.error}`);
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

export class GraphError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function graphGet<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await getToken()}`, Prefer: 'outlook.body-content-type="text"' },
      cache: "no-store",
    });
    if (response.status === 429 || response.status === 503) {
      const wait = Number(response.headers.get("Retry-After") ?? 5);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message ?? response.statusText;
      throw new GraphError(
        response.status,
        response.status === 403 || response.status === 401
          ? `Kein Zugriff auf die Mails (${response.status}). Ist die Berechtigung Mail.Read freigegeben? ${message}`
          : `Microsoft Graph: ${message}`,
      );
    }
    return data as T;
  }
  throw new GraphError(429, "Microsoft Graph ist gerade überlastet, bitte später erneut versuchen.");
}

export async function graphPost(path: string, body: unknown): Promise<void> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new GraphError(
      response.status,
      response.status === 403
        ? `Keine Berechtigung zum Senden (403). Ist Mail.Send für die App freigegeben? ${data?.error?.message ?? ""}`
        : `Microsoft Graph: ${data?.error?.message ?? response.statusText}`,
    );
  }
}

export function mailboxes(): string[] {
  return (process.env.MAIL_MAILBOXES ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
}
