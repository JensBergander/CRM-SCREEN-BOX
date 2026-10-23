ALTER TABLE `deals` ADD `location_street` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `location_zip` varchar(16);--> statement-breakpoint
ALTER TABLE `deals` ADD `location_city` varchar(120);--> statement-breakpoint
ALTER TABLE `deals` ADD `location_country` varchar(2);--> statement-breakpoint
ALTER TABLE `deals` ADD `location_lat` double;--> statement-breakpoint
ALTER TABLE `deals` ADD `location_lng` double;