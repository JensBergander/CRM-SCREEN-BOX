-- Einmalig: Betrag der Vorgänge auf den Nettobetrag des verknüpften Belegs setzen (Rechnung vor Angebot)
UPDATE `deals` d
JOIN `lexware_vouchers` v ON v.`type` = 'invoice' AND v.`number` = d.`invoice_number`
SET d.`amount_net` = v.`net_amount`
WHERE v.`net_amount` IS NOT NULL AND (d.`amount_net` IS NULL OR d.`amount_net` <> v.`net_amount`);
--> statement-breakpoint
UPDATE `deals` d
JOIN `lexware_vouchers` v ON v.`type` = 'quotation' AND v.`number` = d.`offer_number`
SET d.`amount_net` = v.`net_amount`
WHERE d.`invoice_number` IS NULL AND v.`net_amount` IS NOT NULL AND (d.`amount_net` IS NULL OR d.`amount_net` <> v.`net_amount`);
