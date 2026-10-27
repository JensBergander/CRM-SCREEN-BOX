import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  decimal,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// MEDIUMBLOB (bis 16 MB) für PDF-Dateien
const customBlob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "mediumblob",
});

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

export const COMPANY_KINDS = ["kunde", "dienstleister", "lieferant", "wettbewerber"] as const;
export type CompanyKind = (typeof COMPANY_KINDS)[number];

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
    // Kunde, Dienstleister (Sprecher, Fotografen usw., die man bei Bedarf anfragt),
    // Lieferant (Verleih, Druck, Hardware usw., bei denen man kauft oder mietet) oder Wettbewerber
    kind: mysqlEnum("kind", COMPANY_KINDS).notNull().default("kunde"),
    // eigene Einschätzung 0–5 Sterne (0 = keine Angebote mehr); leer = Vorschlag der App gilt
    rating: int("rating"),
    ratingNote: text("rating_note"),
    // Gewerke (Dienstleister) bzw. Kategorien (Lieferanten), kommagetrennt, z. B. „Sprecher, Englisch“
    tags: varchar("tags", { length: 255 }),
    // Name des Ordners auf der Festplatte, z. B. EUROWINGS für Eurowings GmbH
    folderName: varchar("folder_name", { length: 120 }),
    lexwareId: varchar("lexware_id", { length: 64 }).unique(),
    // in Lexware archiviert oder dort nicht mehr vorhanden; bleibt im CRM, rutscht in Listen nach unten
    lexwareArchived: boolean("lexware_archived").notNull().default(false),
    customerNumber: varchar("customer_number", { length: 32 }),
    supplierNumber: varchar("supplier_number", { length: 32 }),
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
    mobile: varchar("mobile", { length: 64 }),
    position: varchar("position", { length: 120 }),
    notes: text("notes"),
    // Ansprechpartner aus Lexware: Name, Mail und Telefon kommen beim Abgleich von dort
    fromLexware: boolean("from_lexware").notNull().default(false),
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
    // wer den Auftrag stattdessen bekommen hat (Firma der Art „wettbewerber“)
    competitorId: int("competitor_id"),
    // Planung: Drehort, Postproduktion (nur Daten), Produktion durchgehend im Kalender blocken
    location: varchar("location", { length: 500 }),
    // gesetzt, wenn der Drehort aus der Adresssuche gewählt wurde: Karte und Navigation im Kalender
    locationStreet: varchar("location_street", { length: 255 }),
    locationZip: varchar("location_zip", { length: 16 }),
    locationCity: varchar("location_city", { length: 120 }),
    locationCountry: varchar("location_country", { length: 2 }),
    locationLat: double("location_lat"),
    locationLng: double("location_lng"),
    postStart: date("post_start", { mode: "string" }),
    postEnd: date("post_end", { mode: "string" }),
    blockContinuous: boolean("block_continuous").notNull().default(false),
    // ein durchgehender Kalendertermin (bei blockContinuous)
    calendarEventId: varchar("calendar_event_id", { length: 255 }),
    calendarError: text("calendar_error"),
    lostNote: text("lost_note"),
    notes: text("notes"),
    stageChangedAt: timestamp("stage_changed_at").notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("deals_company_idx").on(t.companyId), index("deals_stage_idx").on(t.stage)],
);

// Lieferanten eines Vorgangs (z. B. Technikverleih), von Hand oder über eine zugeordnete Mail
export const dealSuppliers = mysqlTable(
  "deal_suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
    dealId: int("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    companyId: int("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    note: varchar("note", { length: 255 }),
    costNet: decimal("cost_net", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("deal_suppliers_unique").on(t.dealId, t.companyId), index("deal_suppliers_company_idx").on(t.companyId)],
);

// Produktionstage eines Vorgangs; jeder Tag hat (ohne „durchgehend blocken“) seinen eigenen Kalendertermin
export const productionDays = mysqlTable(
  "production_days",
  {
    id: int("id").autoincrement().primaryKey(),
    dealId: int("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    eventId: varchar("event_id", { length: 255 }),
  },
  (t) => [index("production_days_deal_idx").on(t.dealId), index("production_days_day_idx").on(t.day)],
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
    // automatische Antwort auf Mails an alte Adressen
    autoReply: mysqlEnum("auto_reply", ["gesendet", "uebersprungen", "fehler"]),
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
    // Positionen als JSON: [{ name, description, quantity, unitName, net, total }]
    lineItems: text("line_items"),
    detailsLoaded: boolean("details_loaded").notNull().default(false),
    // Änderungszeitpunkt in Lexware; ändert er sich, werden Positionen und PDF neu geholt
    lexwareUpdatedAt: varchar("lexware_updated_at", { length: 40 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("lexware_vouchers_contact_idx").on(t.contactId, t.type), index("lexware_vouchers_number_idx").on(t.number)],
);

// PDF-Kopien verknüpfter Angebote und Rechnungen; liegen in der Datenbank und damit in der Sicherung
export const voucherFiles = mysqlTable("voucher_files", {
  voucherId: varchar("voucher_id", { length: 64 }).primaryKey(),
  pdf: customBlob("pdf").notNull(),
  size: int("size").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

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
export type DealSupplier = typeof dealSuppliers.$inferSelect;
export type ProductionDay = typeof productionDays.$inferSelect;
export type Activity = typeof activities.$inferSelect;
