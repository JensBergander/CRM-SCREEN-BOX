import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { lexwareVouchers, voucherFiles } from "@/db/schema";
import { getSession } from "@/lib/session";

// Gesicherte PDF-Kopie eines Lexware-Belegs, nur für angemeldete Nutzer
export async function GET(_: NextRequest, { params }: RouteContext<"/api/belege/[id]">) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "nicht angemeldet" }, { status: 401 });

  const { id } = await params;
  const [file] = await db
    .select({ pdf: voucherFiles.pdf, number: lexwareVouchers.number })
    .from(voucherFiles)
    .innerJoin(lexwareVouchers, eq(lexwareVouchers.id, voucherFiles.voucherId))
    .where(eq(voucherFiles.voucherId, id));
  if (!file) return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });

  const name = `${file.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(file.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
