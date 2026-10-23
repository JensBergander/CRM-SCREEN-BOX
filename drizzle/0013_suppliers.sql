CREATE TABLE `deal_suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deal_id` int NOT NULL,
	`company_id` int NOT NULL,
	`note` varchar(255),
	`cost_net` decimal(12,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deal_suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `deal_suppliers_unique` UNIQUE(`deal_id`,`company_id`)
);
--> statement-breakpoint
ALTER TABLE `companies` MODIFY COLUMN `kind` enum('kunde','dienstleister','lieferant','wettbewerber') NOT NULL DEFAULT 'kunde';--> statement-breakpoint
ALTER TABLE `companies` ADD `supplier_number` varchar(32);--> statement-breakpoint
ALTER TABLE `deal_suppliers` ADD CONSTRAINT `deal_suppliers_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_suppliers` ADD CONSTRAINT `deal_suppliers_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `deal_suppliers_company_idx` ON `deal_suppliers` (`company_id`);