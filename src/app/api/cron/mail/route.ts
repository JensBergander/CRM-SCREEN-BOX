import { NextResponse, type NextRequest } from "next/server";
import { runJobs } from "@/lib/jobs";

// Wird per Cronjob bei Hostinger alle 15 Minuten aufgerufen und erledigt alle
// regelmäßigen Aufgaben (Mails, Lexware-Abgleich, Montags-Mail). Der Pfad heißt
// aus historischen Gründen noch /mail.
// curl -s "https://crm.screen-box.de/api/cron/mail?key=<CRON_SECRET>"
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "nicht erlaubt" }, { status: 401 });
  }
  return NextResponse.json(await runJobs());
}
