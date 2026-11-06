-- Kontakte werden zu Personen mit Firmenzuordnungen: Name, Handy und Notizen wandern in `people`,
-- `contacts` bleibt die Zuordnung zur Firma (Position, Firmen-Mail, Festnetz). Jeder bisherige Kontakt wird eine Person.
CREATE TABLE `people` (
	`id` int AUTO_INCREMENT NOT NULL,
	`first_name` varchar(120),
	`last_name` varchar(120),
	`mobile` varchar(64),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`legacy_contact_id` int,
	CONSTRAINT `people_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `people` (`first_name`, `last_name`, `mobile`, `notes`, `created_at`, `updated_at`, `legacy_contact_id`)
SELECT NULLIF(TRIM(`first_name`), ''), NULLIF(TRIM(`last_name`), ''), `mobile`, `notes`, `created_at`, `updated_at`, `id` FROM `contacts`;
--> statement-breakpoint
-- Platzhalter statt Nachname (z. B. „Arne -“): einmalig leeren, wenn ein Vorname da ist
UPDATE `people` SET `last_name` = NULL
WHERE `first_name` IS NOT NULL
  AND LOWER(TRIM(`last_name`)) IN ('-', '–', '—', '--', '.', '..', '...', '?', '??', 'x', 'xx', 'xxx', 'unbekannt', 'n.n.', 'n. n.', 'nn', 'n/a');
--> statement-breakpoint
ALTER TABLE `contacts` ADD `person_id` int;
--> statement-breakpoint
ALTER TABLE `contacts` ADD `ended_at` timestamp NULL;
--> statement-breakpoint
UPDATE `contacts` c JOIN `people` p ON p.`legacy_contact_id` = c.`id` SET c.`person_id` = p.`id`, c.`updated_at` = c.`updated_at`;
--> statement-breakpoint
ALTER TABLE `contacts` MODIFY COLUMN `person_id` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_person_id_people_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `contacts_person_idx` ON `contacts` (`person_id`);
--> statement-breakpoint
ALTER TABLE `contacts` DROP COLUMN `first_name`, DROP COLUMN `last_name`, DROP COLUMN `mobile`, DROP COLUMN `notes`;
--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `legacy_contact_id`;
--> statement-breakpoint
CREATE INDEX `people_last_name_idx` ON `people` (`last_name`);
--> statement-breakpoint
CREATE TABLE `activity_people` (
	`activity_id` int NOT NULL,
	`person_id` int NOT NULL,
	CONSTRAINT `activity_people_activity_id_person_id_pk` PRIMARY KEY(`activity_id`,`person_id`)
);
--> statement-breakpoint
ALTER TABLE `activity_people` ADD CONSTRAINT `activity_people_activity_id_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `activity_people` ADD CONSTRAINT `activity_people_person_id_people_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `activity_people_person_idx` ON `activity_people` (`person_id`);
--> statement-breakpoint
CREATE TABLE `task_people` (
	`task_id` int NOT NULL,
	`person_id` int NOT NULL,
	CONSTRAINT `task_people_task_id_person_id_pk` PRIMARY KEY(`task_id`,`person_id`)
);
--> statement-breakpoint
ALTER TABLE `task_people` ADD CONSTRAINT `task_people_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `task_people` ADD CONSTRAINT `task_people_person_id_people_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `task_people_person_idx` ON `task_people` (`person_id`);
