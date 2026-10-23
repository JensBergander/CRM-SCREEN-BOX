CREATE TABLE `mail_ignore` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pattern` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mail_ignore_id` PRIMARY KEY(`id`),
	CONSTRAINT `mail_ignore_pattern_unique` UNIQUE(`pattern`)
);
