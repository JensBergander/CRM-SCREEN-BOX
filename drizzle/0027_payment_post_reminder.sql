ALTER TABLE `tasks` MODIFY COLUMN `kind` enum('nachfassen','rechnung','zahlung','jahrestermin');--> statement-breakpoint
ALTER TABLE `companies` ADD `payment_term_days` int;--> statement-breakpoint
ALTER TABLE `deals` ADD `post_end_planned` date;--> statement-breakpoint
ALTER TABLE `deals` ADD `post_finished` date;--> statement-breakpoint
ALTER TABLE `deals` ADD `one_off` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `manual_due` boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `deals` SET `post_end_planned` = `post_end` WHERE `post_end` IS NOT NULL;--> statement-breakpoint
UPDATE `companies` SET `payment_term_days` = 30 WHERE `name` = 'Eurowings Aviation GmbH';
