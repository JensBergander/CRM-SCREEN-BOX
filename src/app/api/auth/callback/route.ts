import { NextResponse, type NextRequest } from "next/server";
import { decodeIdToken } from "arctic";
import {
  entraClient,
  isAllowed,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/auth";
import { getSession } from "@/lib/session";

type EntraClaims = {
  tid: string;
  name?: string;
  email?: string;
  preferred_username?: string;
};

function fail(request: NextRequest, reason: string) {
  const url = new URL("/login", process.env.APP_URL ?? request.url);
  url.searchParams.set("fehler", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  if (!code || !state || !verifier || state !== storedState) {
    return fail(request, "abgelaufen");
  }

  let claims: EntraClaims;
  try {
    const tokens = await entraClient().validateAuthorizationCode(code, verifier);
    claims = decodeIdToken(tokens.idToken()) as EntraClaims;
  } catch {
    return fail(request, "microsoft");
  }

  const email = claims.email ?? claims.preferred_username ?? "";
  if (!email || !isAllowed(email, claims.tid)) {
    return fail(request, "nicht-freigegeben");
  }

  const session = await getSession();
  session.user = { email, name: claims.name ?? email };
  await session.save();

  const response = NextResponse.redirect(new URL("/", process.env.APP_URL ?? request.url));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_VERIFIER_COOKIE);
  return response;
}
