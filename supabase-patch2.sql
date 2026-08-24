-- ============================================================
-- Madrasa Reports - PATCH 2 (run once, after patch 1)
-- Adds missing qari INSERT/UPDATE policies.
-- Bug: the app lets the qari mark fees and save weekly/monthly
-- reports, but RLS only granted qari SELECT on those tables,
-- so every save silently failed with 403.
-- ============================================================

-- fee_payments: qari marks a student's fee as paid/unpaid
create policy "qari insert fee_payments" on fee_payments
  for insert
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = fee_payments.student_id and s.class_id = p.class_id
    )
  );

create policy "qari update fee_payments" on fee_payments
  for update
  using (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = fee_payments.student_id and s.class_id = p.class_id
    )
  )
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = fee_payments.student_id and s.class_id = p.class_id
    )
  );

-- weekly_reports: qari saves the weekly summary
create policy "qari insert weekly" on weekly_reports
  for insert
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = weekly_reports.student_id and s.class_id = p.class_id
    )
  );

create policy "qari update weekly" on weekly_reports
  for update
  using (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = weekly_reports.student_id and s.class_id = p.class_id
    )
  )
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = weekly_reports.student_id and s.class_id = p.class_id
    )
  );

-- monthly_reports: qari saves the monthly summary
create policy "qari insert monthly" on monthly_reports
  for insert
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = monthly_reports.student_id and s.class_id = p.class_id
    )
  );

create policy "qari update monthly" on monthly_reports
  for update
  using (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = monthly_reports.student_id and s.class_id = p.class_id
    )
  )
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = monthly_reports.student_id and s.class_id = p.class_id
    )
  );

-- fee_settings: qari insert (new students via saveStudent path)
create policy "qari insert fee_settings" on fee_settings
  for insert
  with check (
    auth.role() = 'authenticated' and exists (
      select 1 from profiles p, students s
      where p.id = auth.uid() and s.id = fee_settings.student_id and s.class_id = p.class_id
    )
  );
