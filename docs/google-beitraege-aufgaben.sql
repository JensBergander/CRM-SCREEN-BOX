-- Wöchentliche Aufgaben für Google-Beiträge (Plan: docs/google-beitraege-plan.md)
-- Stand 26.11.2026. HINWEIS: Am 26.11.2026 bereits über die CRM-Oberfläche eingetragen, nur noch als Reserve.
-- Legt jede Aufgabe nur an, wenn es eine mit gleichem Titel noch nicht gibt.
-- Ausführen gegen die Live-Datenbank u854230355_crm, z. B. in phpMyAdmin (hPanel → Datenbanken).

INSERT INTO tasks (title, due_date)
SELECT t.title, t.due_date FROM (
  SELECT 'Google-Beitrag: Weihnachtsfeier fotografieren' AS title, DATE('2026-12-03') AS due_date
  UNION ALL SELECT 'Google-Beitrag: Vorlage Fotos auf Veranstaltungen (DSGVO)', DATE('2026-12-10')
  UNION ALL SELECT 'Google-Beitrag: Social-Media-Reels', DATE('2026-12-17')
  UNION ALL SELECT 'Google-Beitrag: Vorlage Einwilligung Mitarbeiterfotos', DATE('2027-01-07')
  UNION ALL SELECT 'Google-Beitrag: Recruiting-Video', DATE('2027-01-14')
  UNION ALL SELECT 'Google-Beitrag: Tagungsfotograf', DATE('2027-01-21')
  UNION ALL SELECT 'Google-Beitrag: Messefilm', DATE('2027-01-28')
  UNION ALL SELECT 'Google-Beitrag: Produktfotografie', DATE('2027-02-04')
  UNION ALL SELECT 'Google-Beitrag: Employer Branding Fotografie', DATE('2027-02-11')
  UNION ALL SELECT 'Google-Beitrag: Drohnenaufnahmen', DATE('2027-02-18')
  UNION ALL SELECT 'Google-Beitrag: Industriefotografie', DATE('2027-02-25')
  UNION ALL SELECT 'Google-Beitrag: Food-Fotografie (nur mit eigenem Foto)', DATE('2027-03-04')
  UNION ALL SELECT 'Google-Beitrag: Architekturfotografie', DATE('2027-03-11')
  UNION ALL SELECT 'Google-Beitrag: Video-Podcast', DATE('2027-03-18')
  UNION ALL SELECT 'Google-Beitrag: Webdesign', DATE('2027-03-25')
) AS t
WHERE NOT EXISTS (SELECT 1 FROM tasks x WHERE x.title = t.title);

-- Kontrolle
SELECT id, title, due_date FROM tasks WHERE title LIKE 'Google-Beitrag:%' ORDER BY due_date;
