-- Termine aus dem Outlook-Kalender (nur gelesen)
CREATE TABLE `calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mailbox` varchar(120) NOT NULL,
	`graph_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
	`subject` varchar(500) NOT NULL,
	`start_at` timestamp NOT NULL,
	`end_at` timestamp NOT NULL,
	`all_day` boolean NOT NULL DEFAULT false,
	`location` varchar(500),
	`join_url` text,
	`web_link` text,
	`attendees` text,
	`deal_id` int,
	`company_id` int,
	`person_id` int,
	`manual` boolean NOT NULL DEFAULT false,
	`activity_id` int,
	`logged` boolean NOT NULL DEFAULT false,
	`reviewed_at` timestamp,
	`seen_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `calendar_events_graph_idx` UNIQUE(`mailbox`,`graph_id`)
);
--> statement-breakpoint
ALTER TABLE `activities` MODIFY COLUMN `type` enum('notiz','anruf','phase','mail','termin') NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_person_id_people_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_activity_id_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `calendar_events_start_idx` ON `calendar_events` (`start_at`);--> statement-breakpoint
CREATE INDEX `calendar_events_company_idx` ON `calendar_events` (`company_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `calendar_events_person_idx` ON `calendar_events` (`person_id`,`start_at`);