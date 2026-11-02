-- Outlook-IDs unterscheiden Groß- und Kleinschreibung; ohne binäre Sortierung hielt der eindeutige Index zwei Mails für eine
ALTER TABLE `emails` MODIFY `graph_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
