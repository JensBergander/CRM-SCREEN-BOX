ALTER TABLE `companies` MODIFY COLUMN `kind` enum('kunde','dienstleister','wettbewerber') NOT NULL DEFAULT 'kunde';--> statement-breakpoint
ALTER TABLE `companies` ADD `rating` int;--> statement-breakpoint
ALTER TABLE `companies` ADD `rating_note` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `competitor_id` int;