CREATE TABLE `emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`graph_id` varchar(255) NOT NULL,
	`mailbox` varchar(120) NOT NULL,
	`internet_message_id` varchar(255),
	`conversation_id` varchar(255),
	`outgoing` boolean NOT NULL DEFAULT false,
	`from_address` varchar(255),
	`from_name` varchar(255),
	`to_addresses` text,
	`subject` varchar(500),
	`preview` text,
	`web_link` text,
	`has_attachments` boolean NOT NULL DEFAULT false,
	`received_at` timestamp NOT NULL,
	`company_id` int,
	`contact_id` int,
	`deal_id` int,
	`status` enum('neu','zugeordnet','ignoriert') NOT NULL DEFAULT 'neu',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `emails_graph_idx` UNIQUE(`mailbox`,`graph_id`)
);
--> statement-breakpoint
CREATE TABLE `mail_sync` (
	`mailbox` varchar(120) NOT NULL,
	`last_received_at` timestamp,
	`last_run_at` timestamp,
	`last_error` text,
	CONSTRAINT `mail_sync_mailbox` PRIMARY KEY(`mailbox`)
);
--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_contact_id_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `emails_company_idx` ON `emails` (`company_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `emails_status_idx` ON `emails` (`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `emails_from_idx` ON `emails` (`from_address`);