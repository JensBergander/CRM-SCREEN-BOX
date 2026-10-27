ALTER TABLE `companies` ADD `lexware_archived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `from_lexware` boolean DEFAULT false NOT NULL;