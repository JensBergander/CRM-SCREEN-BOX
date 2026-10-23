import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const STAGES = [
  "anfrage",
  "angebot",
  "beauftragt",
  "erledigt",
  "rechnung",
  "bezahlt",
  "verloren",
] as const;
export type Stage = (typeof STAGES)[number];

export const LOST_REASONS = [
  "preis",
  "vergleichsangebot",
  "timing",
  "wettbewerber",
  "keine_rueckmeldung",
  "sonstiges",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const TASK_KINDS = ["nachfassen", "rechnung", "zahlung"] as const;
export const ACTIVITY_TYPES = ["notiz", "anruf", "phase", "mail"] as const;

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date()),
};

export const companies = mysqlTable(
  "companies",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    // Name des Ordners auf der Festplatte, z. B. EUROWINGS für Eurowings GmbH
    folderName: varchar("folder_name", { length: 120 }),
    lexwareId: varchar("lexware_id", { length: 64 }).unique(),
    customerNumber: varchar("customer_number", { length: 32 }),
    street: varchar("street", { length: 255 }),
    zip: varchar("zip", { length: 16 }),
    city: varchar("city", { length: 120 }),
    website: varchar("website", { length: 255 }),
    emailDomain: varchar("email_domain", { length: 120 }),
    industry: varchar("industry", { length: 120 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("companies_name_idx").on(t.name), index("companies_domain_idx").on(t.emailDomain)],
);

export const contacts = mysqlTable(
  "contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").references(() => companies.id, { onDelete: "set null" }),
    firstName: varchar("first_name", { length: 120 }),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    position: varchar("position", { length: 120 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("contacts_company_idx").on(t.companyId), index("contacts_email_idx").on(t.email)],
);

export const deals = mysqlTable(
  "deals",
  {
    id: int("id").autoincrement().primaryKey(),
    // JJJJ-NNN, vergeben beim Wechsel auf „Beauftragt“
    number: varchar("number", { length: 16 }).unique(),
    companyId: int("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    contactId: int("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    stage: mysqlEnum("stage", STAGES).notNull().default("anfrage"),
    amountNet: decimal("amount_net", { precision: 12, scale: 2 }),
    projectDate: date("project_date", { mode: "string" }),
    offerNumber: varchar("offer_number", { length: 64 }),
    invoiceNumber: varchar("invoice_number", { length: 64 }),
    compareOnly: boolean("compare_only").notNull().default(false),
    quick: boolean("quick").notNull().default(false),
    lostReason: mysqlEnum("lost_reason", LOST_REASONS),
    lostNote: text("lost_note"),
    notes: text("notes"),
    stageChangedAt: timestamp("stage_changed_at").notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("deals_company_idx").on(t.companyId), index("deals_stage_idx").on(t.stage)],
);

export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    companyId: int("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: int("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    // gesetzt bei Aufgaben, die die App selbst anlegt
    kind: mysqlEnum("kind", TASK_KINDS),
    doneAt: timestamp("done_at"),
    ...timestamps,
  },
  (t) => [index("tasks_due_idx").on(t.dueDate), index("tasks_deal_idx").on(t.dealId)],
);

export const activities = mysqlTable(
  "activities",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: int("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ACTIVITY_TYPES).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("activities_company_idx").on(t.companyId, t.createdAt)],
);

export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Activity = typeof activities.$inferSelect;
