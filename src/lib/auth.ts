import "server-only";
import { redirect } from "next/navigation";
import { MicrosoftEntraId } from "arctic";
import { getSession } from "./session";

export const OAUTH_STATE_COOKIE = "crm_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "crm_oauth_verifier";
export const LOGIN_SCOPES = ["openid", "profile", "email"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return value;
}

export function entraClient() {
  return new MicrosoftEntraId(
    requireEnv("ENTRA_TENANT_ID"),
    requireEnv("ENTRA_CLIENT_ID"),
    requireEnv("ENTRA_CLIENT_SECRET"),
    `${requireEnv("APP_URL")}/api/auth/callback`,
  );
}

// Nur ausdrücklich freigegebene Konten aus dem eigenen Tenant dürfen hinein.
export function isAllowed(email: string, tenantId: string): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return (
    tenantId === process.env.ENTRA_TENANT_ID &&
    allowed.includes(email.toLowerCase())
  );
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return session.user;
}
