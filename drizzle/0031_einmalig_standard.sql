-- Neue Vorgänge sind standardmäßig einmalig (keine Jahres-Erinnerung); bestehende bleiben, wie sie sind
ALTER TABLE `deals` MODIFY COLUMN `one_off` boolean NOT NULL DEFAULT true;