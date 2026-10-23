import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? request.url), 303);
}
