-- Outlook-Status der Termine merken: Wechsel von „Mit Vorbehalt“ auf „Gebucht“ bestätigt den Vorgang
ALTER TABLE `calendar_events` ADD `show_as` varchar(20);