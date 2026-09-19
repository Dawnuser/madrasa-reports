-- ==========================================================
-- Madrasa Dar ul Ma'arij — Qaida half-line (0.5) support
-- Paste into Supabase Dashboard → SQL Editor → Run
-- BEFORE pushing the app code with the 0.5 lines option.
-- (Until this runs, saving a qaida report with 0.5 lines
--  will fail — old app versions keep working fine.)
-- ==========================================================

-- Lines recited must hold 0.5 for qaida.
-- numeric accepts all existing integer values unchanged.
alter table reports alter column lines type numeric using lines::numeric;
