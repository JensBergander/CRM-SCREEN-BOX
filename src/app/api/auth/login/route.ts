import { NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import {
  entraClient,
  LOGIN_SCOPES,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/auth";

export async function GET() {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = entraClient().createAuthorizationURL(state, verifier, LOGIN_SCOPES);
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookie);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookie);
  return response;
}
