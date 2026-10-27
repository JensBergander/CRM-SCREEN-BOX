ALTER TABLE `deals` ADD `website_event_id` int;--> statement-breakpoint
ALTER TABLE `deals` ADD `website_name` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `website_public` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `website_public_sent` boolean;--> statement-breakpoint
ALTER TABLE `deals` ADD `website_own` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `website_candidates` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `website_notice` varchar(500);--> statement-breakpoint
ALTER TABLE `deals` ADD `website_error` text;