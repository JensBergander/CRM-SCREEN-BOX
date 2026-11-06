import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

// Anzeigename je Login (das Microsoft-Konto heißt z. B. nur „office@screen-box“); unter Einstellungen änderbar
const key = (email: string) => `display_name:${email.trim().toLowerCase()}`.slice(0, 64);

export async function displayName(user: { email: string; name: string }): Promise<string | null> {
  const [row] = await db.select({ value: appState.value }).from(appState).where(eq(appState.key, key(user.email)));
  if (row?.value?.trim()) return row.value.trim();
  // Name aus Microsoft nur, wenn er nach einem Namen aussieht (keine Adresse)
  return user.name && !user.name.includes("@") ? user.name.trim() : null;
}

export async function saveDisplayName(email: string, name: string) {
  const value = name.trim().slice(0, 120);
  await db.insert(appState).values({ key: key(email), value }).onDuplicateKeyUpdate({ set: { value } });
}

export const firstNameOf = (name: string | null) => name?.split(/\s+/)[0] ?? null;
