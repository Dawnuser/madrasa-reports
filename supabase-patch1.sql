-- ==========================================================
-- Madrasa Reports — PATCH 1 (run once, after the main schema)
-- Adds weekly/monthly report tables + trash table + their RLS.
-- ==========================================================

create table if not exists weekly_reports (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  week_key   text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(student_id, week_key)
);

create table if not exists monthly_reports (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  ym         text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(student_id, ym)
);

create table if not exists trash (
  id         uuid primary key default gen_random_uuid(),
  tid        text not null,
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now()
);

alter table weekly_reports enable row level security;
alter table monthly_reports enable row level security;
alter table trash enable row level security;

create policy "admin all weekly"    on weekly_reports for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all monthly"   on monthly_reports for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all trash"     on trash           for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "qari weekly"   on weekly_reports for select using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = weekly_reports.student_id and s.class_id = p.class_id));
create policy "qari monthly"  on monthly_reports for select using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = monthly_reports.student_id and s.class_id = p.class_id));

-- ==========================================================
-- Run this in the SQL Editor now. Then we wire the app.
-- ==========================================================