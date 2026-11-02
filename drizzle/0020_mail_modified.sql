ALTER TABLE `mail_sync` ADD `last_modified_at` timestamp;--> statement-breakpoint
CREATE INDEX `emails_message_idx` ON `emails` (`mailbox`,`internet_message_id`);