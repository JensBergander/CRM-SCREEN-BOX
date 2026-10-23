CREATE TABLE `app_state` (
	`key` varchar(64) NOT NULL,
	`value` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_state_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `lexware_vouchers` (
	`id` varchar(64) NOT NULL,
	`number` varchar(64) NOT NULL,
	`type` varchar(32) NOT NULL,
	`status` varchar(32) NOT NULL,
	`contact_id` varchar(64),
	`contact_name` varchar(255),
	`total_amount` decimal(12,2),
	`net_amount` decimal(12,2),
	`open_amount` decimal(12,2),
	`voucher_date` timestamp,
	`due_date` timestamp,
	`quotation_id` varchar(64),
	`details_loaded` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lexware_vouchers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `lexware_vouchers_contact_idx` ON `lexware_vouchers` (`contact_id`,`type`);--> statement-breakpoint
CREATE INDEX `lexware_vouchers_number_idx` ON `lexware_vouchers` (`number`);