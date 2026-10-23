import "server-only";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, deals, tasks, type LostReason, type Stage } from "@/db/schema";
import { addDaysIso, todayIso } from "./format";
import { LOST_REASON_LABEL, STAGE_LABEL } from "./labels";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Nächste freie Projektnummer im Format JJJJ-NNN
async function nextDealNumber(tx: Tx): Promise<string> {
  const year = todayIso().slice(0, 4);
  const [row] = await tx
    .select({ max: sql<string | null>`max(${deals.number})` })
    .from(deals)
    .where(like(deals.number, `${year}-%`))
    .for("update");
  const last = row?.max ? Number(row.max.slice(5)) : 0;
  return `${year}-${String(last + 1).padStart(3, "0")}`;
}

async function closeAutoTasks(tx: Tx, dealId: number, kinds: ("nachfassen" | "rechnung" | "zahlung")[]) {
  await tx
    .update(tasks)
    .set({ doneAt: new Date() })
    .where(and(eq(tasks.dealId, dealId), inArray(tasks.kind, kinds), isNull(tasks.doneAt)));
}

async function addAutoTask(
  tx: Tx,
  deal: { id: number; companyId: number; title: string },
  kind: "nachfassen" | "rechnung" | "zahlung",
  dueInDays: number,
) {
  const titles = {
    nachfassen: "Nachfassen",
    rechnung: "Rechnung stellen",
    zahlung: "Zahlung prüfen",
  };
  await tx.insert(tasks).values({
    title: `${titles[kind]}: ${deal.title}`,
    dueDate: addDaysIso(todayIso(), dueInDays),
    companyId: deal.companyId,
    dealId: deal.id,
    kind,
  });
}

// Setzt die Folgen eines Phasenwechsels um: Nummer, automatische Aufgaben, Zeitleiste.
async function applyStageEffects(tx: Tx, dealId: number, to: Stage, from: Stage | null) {
  const [deal] = await tx.select().from(deals).where(eq(deals.id, dealId));

  if (!deal.number && ["beauftragt", "erledigt", "rechnung", "bezahlt"].includes(to)) {
    await tx.update(deals).set({ number: await nextDealNumber(tx) }).where(eq(deals.id, dealId));
  }

  if (to !== "angebot") await closeAutoTasks(tx, dealId, ["nachfassen"]);
  if (to === "angebot") await addAutoTask(tx, deal, "nachfassen", 10);
  if (to === "erledigt") await addAutoTask(tx, deal, "rechnung", 0);
  if (to === "rechnung" || to === "bezahlt") await closeAutoTasks(tx, dealId, ["rechnung"]);
  if (to === "rechnung") await addAutoTask(tx, deal, "zahlung", 14);
  if (to === "bezahlt" || to === "verloren") await closeAutoTasks(tx, dealId, ["rechnung", "zahlung"]);

  const text = from
    ? `${deal.title}: ${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}`
    : `${deal.title}: angelegt als ${STAGE_LABEL[to]}`;
  await tx.insert(activities).values({
    companyId: deal.companyId,
    dealId,
    type: "phase",
    body: to === "verloren" && deal.lostReason
      ? `${text} (${LOST_REASON_LABEL[deal.lostReason]})`
      : text,
  });
}

export type NewDeal = {
  companyId: number;
  contactId?: number | null;
  title: string;
  stage: Stage;
  amountNet?: string | null;
  projectDate?: string | null;
  compareOnly?: boolean;
  quick?: boolean;
  notes?: string | null;
};

export async function createDeal(input: NewDeal): Promise<number> {
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(deals).values({ ...input, stageChangedAt: new Date() });
    await applyStageEffects(tx, result.insertId, input.stage, null);
    return result.insertId;
  });
}

export async function changeStage(
  dealId: number,
  to: Stage,
  lost?: { reason: LostReason; note?: string | null },
) {
  if (to === "verloren" && !lost) throw new Error("Für „Verloren“ ist ein Grund Pflicht");
  await db.transaction(async (tx) => {
    const [deal] = await tx.select({ stage: deals.stage }).from(deals).where(eq(deals.id, dealId)).for("update");
    if (!deal || deal.stage === to) return;
    await tx
      .update(deals)
      .set({
        stage: to,
        stageChangedAt: new Date(),
        lostReason: to === "verloren" ? lost!.reason : null,
        lostNote: to === "verloren" ? lost!.note ?? null : null,
      })
      .where(eq(deals.id, dealId));
    await applyStageEffects(tx, dealId, to, deal.stage);
  });
}
