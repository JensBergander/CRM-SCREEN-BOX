import { NextResponse, type NextRequest } from "next/server";

// Schnelle Vorprüfung: ohne Sitzungs-Cookie direkt zum Login.
// Die eigentliche Prüfung passiert in getCurrentUser().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("crm_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|_next|favicon.ico|robots.txt).*)"],
};
