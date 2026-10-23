import { NextResponse, type NextRequest } from "next/server";
import { syncMailboxes } from "@/lib/mail";

// Wird per Cronjob bei Hostinger aufgerufen, z. B. alle 15 Minuten:
// curl -s "https://crm.screen-box.de/api/cron/mail?key=<CRON_SECRET>"
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "nicht erlaubt" }, { status: 401 });
  }
  const result = await syncMailboxes();
  return NextResponse.json({ ok: result.every((r) => !r.error), result });
}
