CREATE TABLE `production_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deal_id` int NOT NULL,
	`day` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`event_id` varchar(255),
	CONSTRAINT `production_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `location` varchar(500);--> statement-breakpoint
ALTER TABLE `deals` ADD `post_start` date;--> statement-breakpoint
ALTER TABLE `deals` ADD `post_end` date;--> statement-breakpoint
ALTER TABLE `deals` ADD `block_continuous` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `calendar_event_id` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `calendar_error` text;--> statement-breakpoint
ALTER TABLE `production_days` ADD CONSTRAINT `production_days_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `production_days_deal_idx` ON `production_days` (`deal_id`);--> statement-breakpoint
CREATE INDEX `production_days_day_idx` ON `production_days` (`day`);