-- ============================================================
-- Madrasa Reports — QARI FEE_SETTINGS UPDATE (run once)
-- Bug: when a qari flips a student Full-time/Part-time, the student
-- row updates but the fee-amount follow-up (25 OMR full / 18 OMR
-- part) silently fails with 403 — fee_settings had qari SELECT +
-- INSERT policies but no UPDATE policy.
-- Paste into Supabase Dashboard → SQL Editor → Run, BEFORE pushing
-- the app code that relies on it (code already attempts the update).
-- ============================================================

create policy "qari update fee_settings" on fee_settings
  for update
  using (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = fee_settings.student_id and s.class_id = p.class_id
    )
  )
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = fee_settings.student_id and s.class_id = p.class_id
    )
  );
