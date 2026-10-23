import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  user?: { email: string; name: string };
};

export const SESSION_COOKIE = "crm_session";

const sessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE,
  password: process.env.SESSION_SECRET as string,
  ttl: 60 * 60 * 24 * 14,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
