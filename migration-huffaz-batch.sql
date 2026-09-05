-- ==========================================================
-- Madrasa Dar ul Ma'arij — Migration Batch A+B
-- (Huffaz table, From Start/End, Tests, Manzil para, Reason)
-- Paste into Supabase Dashboard > SQL Editor and run.
-- ==========================================================

-- 1. STUDENT PROFILE FIELDS (From Start / From End / Tests)
alter table students add column if not exists from_start int;
alter table students add column if not exists from_end int;
alter table students add column if not exists tests_passed int not null default 0;

-- 2. REPORT FIELDS (Manzil para / Reason)
alter table reports add column if not exists manzil_para int;
alter table reports add column if not exists reason boolean not null default false;

-- 3. HUFFAZ (graduated Hafiz students — principal only, no class)
create table if not exists huffaz (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  graduation_year int,
  parent_name     text,
  parent_number   text,
  completed_under text,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table huffaz enable row level security;

-- Admin (principal): full access. No qari/parent policies on purpose.
drop policy if exists "admin all huffaz" on huffaz;
create policy "admin all huffaz" on huffaz for all
  using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
