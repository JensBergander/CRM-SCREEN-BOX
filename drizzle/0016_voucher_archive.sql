ALTER TABLE `deals` ADD `from_lexware` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `lexware_draft_id` varchar(64);--> statement-breakpoint
ALTER TABLE `lexware_vouchers` ADD `archived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lexware_vouchers` ADD `fresh` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `lexware_vouchers` ADD `pending` boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Stichtag: alles, was schon vorhanden ist, ist kein neuer Beleg für die Automatik
UPDATE `lexware_vouchers` SET `fresh` = false;--> statement-breakpoint
-- Altlasten archivieren: unverknüpfte Belege, außer jüngeren als 60 Tage bei Firmen mit laufendem Vorgang
UPDATE `lexware_vouchers` v SET v.`archived` = true
WHERE NOT EXISTS (SELECT 1 FROM `deals` d WHERE d.`offer_number` = v.`number` OR d.`invoice_number` = v.`number`)
  AND NOT (
    COALESCE(v.`voucher_date` >= NOW() - INTERVAL 60 DAY, false)
    AND EXISTS (
      SELECT 1 FROM `deals` d2 JOIN `companies` c ON c.`id` = d2.`company_id`
      WHERE c.`lexware_id` = v.`contact_id` AND d2.`stage` NOT IN ('bezahlt', 'verloren')
    )
  );
