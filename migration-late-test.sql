-- ==========================================================
-- Madrasa Dar ul Ma'arij — Late + Test daily flags
-- Paste into Supabase Dashboard > SQL Editor and run
-- BEFORE qari sahabs use the new Late/Test toggles.
-- (Until this runs, saving a report with Late/Test ticked
--  will fail — old app versions keep working fine.)
-- ==========================================================

-- Late: tilawa + qaida daily reports (came late that day)
alter table reports add column if not exists late boolean not null default false;

-- Test: hifz daily reports (gave a test that day)
alter table reports add column if not exists test_done boolean not null default false;
