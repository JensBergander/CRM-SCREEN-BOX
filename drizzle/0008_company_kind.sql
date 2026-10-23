ALTER TABLE `companies` ADD `kind` enum('kunde','dienstleister') DEFAULT 'kunde' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `tags` varchar(255);