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
  uniqueIndex,
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
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 255 }),
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

export const MAIL_STATUS = ["neu", "zugeordnet", "ignoriert"] as const;

export const emails = mysqlTable(
  "emails",
  {
    id: int("id").autoincrement().primaryKey(),
    // ID der Nachricht in Microsoft Graph, je Postfach eindeutig
    graphId: varchar("graph_id", { length: 255 }).notNull(),
    mailbox: varchar("mailbox", { length: 120 }).notNull(),
    internetMessageId: varchar("internet_message_id", { length: 255 }),
    conversationId: varchar("conversation_id", { length: 255 }),
    outgoing: boolean("outgoing").notNull().default(false),
    fromAddress: varchar("from_address", { length: 255 }),
    fromName: varchar("from_name", { length: 255 }),
    // Empfänger kommagetrennt
    toAddresses: text("to_addresses"),
    subject: varchar("subject", { length: 500 }),
    preview: text("preview"),
    webLink: text("web_link"),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    receivedAt: timestamp("received_at").notNull(),
    companyId: int("company_id").references(() => companies.id, { onDelete: "set null" }),
    contactId: int("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: int("deal_id").references(() => deals.id, { onDelete: "set null" }),
    status: mysqlEnum("status", MAIL_STATUS).notNull().default("neu"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("emails_graph_idx").on(t.mailbox, t.graphId),
    index("emails_company_idx").on(t.companyId, t.receivedAt),
    index("emails_status_idx").on(t.status, t.receivedAt),
    index("emails_from_idx").on(t.fromAddress),
  ],
);

// Absender (ganze Adresse oder Domain), deren Mails automatisch ignoriert werden
export const mailIgnore = mysqlTable("mail_ignore", {
  id: int("id").autoincrement().primaryKey(),
  pattern: varchar("pattern", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Stand des Abrufs je Postfach
export const mailSync = mysqlTable("mail_sync", {
  mailbox: varchar("mailbox", { length: 120 }).primaryKey(),
  lastReceivedAt: timestamp("last_received_at"),
  lastRunAt: timestamp("last_run_at"),
  lastError: text("last_error"),
});

// Zwischenspeicher der Angebote und Rechnungen aus Lexware (nur gelesen)
export const lexwareVouchers = mysqlTable(
  "lexware_vouchers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    number: varchar("number", { length: 64 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    contactId: varchar("contact_id", { length: 64 }),
    contactName: varchar("contact_name", { length: 255 }),
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
    netAmount: decimal("net_amount", { precision: 12, scale: 2 }),
    openAmount: decimal("open_amount", { precision: 12, scale: 2 }),
    voucherDate: timestamp("voucher_date"),
    dueDate: timestamp("due_date"),
    // ID des Angebots, aus dem eine Rechnung entstanden ist
    quotationId: varchar("quotation_id", { length: 64 }),
    detailsLoaded: boolean("details_loaded").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("lexware_vouchers_contact_idx").on(t.contactId, t.type), index("lexware_vouchers_number_idx").on(t.number)],
);

// Einfache Schlüssel-Wert-Ablage, z. B. wann die Montags-Mail zuletzt verschickt wurde
export const appState = mysqlTable("app_state", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LexwareVoucher = typeof lexwareVouchers.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Activity = typeof activities.$inferSelect;
