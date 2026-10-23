CREATE TABLE `voucher_files` (
	`voucher_id` varchar(64) NOT NULL,
	`pdf` mediumblob NOT NULL,
	`size` int NOT NULL,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voucher_files_voucher_id` PRIMARY KEY(`voucher_id`)
);
--> statement-breakpoint
ALTER TABLE `lexware_vouchers` ADD `line_items` text;