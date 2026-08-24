-- ==========================================================
-- Madrasa Dar ul Ma'arij — Supabase Schema
-- Paste this into Supabase SQL Editor (Dashboard > SQL Editor)
-- ==========================================================

-- 1. CLASSES
create table if not exists classes (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  qari_name text not null,
  category  text not null,
  qari_phone text,
  created_at timestamptz not null default now()
);

-- 2. STUDENTS
create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  name          text not null,
  father_name   text,
  age           int,
  para          int,
  current_page  int,
  full_time     boolean not null default true,
  parent_name   text,
  parent_number text,
  oman_id       text,
  category      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3. DAILY REPORTS
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  date        date not null,
  present     boolean not null default true,
  sabaq_done  boolean,
  pages       int,
  lines       int,
  sabqi_done  boolean,
  manzil_done boolean,
  manzil      text,
  comment     text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique(student_id, date)
);

-- 4. FEE SETTINGS (amount per student)
create table if not exists fee_settings (
  student_id uuid primary key references students(id) on delete cascade,
  amount     numeric(6,2) not null,
  updated_at timestamptz not null default now()
);

-- 5. FEE PAYMENTS (one row per student-month)
create table if not exists fee_payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  month       date not null,  -- first day of month, e.g. '2026-08-01'
  paid        boolean not null default false,
  marked_by   uuid references auth.users(id),
  marked_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique(student_id, month)
);

-- 6. PROFILES (syncs with auth.users via trigger)
create table if not exists profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  name     text not null,
  role     text not null check (role in ('admin', 'qari')),
  class_id uuid references classes(id) on delete set null,
  phone    text,
  created_at timestamptz not null default now()
);

-- 7. WEEKLY + MONTHLY REPORTS (one row per student-period, JSONB body)
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

-- 8. TRASH (recently deleted, kept 30 days) — JSONB payload snapshots
create table if not exists trash (
  id         uuid primary key default gen_random_uuid(),
  tid        text not null,
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now()
);

-- ==========================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ==========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'qari'),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================
-- ROW LEVEL SECURITY
-- ==========================================================
alter table classes enable row level security;
alter table students enable row level security;
alter table reports enable row level security;
alter table fee_settings enable row level security;
alter table fee_payments enable row level security;
alter table profiles enable row level security;
alter table weekly_reports enable row level security;
alter table monthly_reports enable row level security;
alter table trash enable row level security;

-- Admin: full access to everything
create policy "admin all classes"    on classes      for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all students"   on students     for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all reports"    on reports      for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all fee_settings" on fee_settings for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all fee_payments" on fee_payments for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all weekly"    on weekly_reports for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all monthly"   on monthly_reports for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin all trash"     on trash           for all using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Qari: own class only
create policy "qari classes"    on classes      for select using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and class_id = classes.id));
create policy "qari students"   on students     for select using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and class_id = students.class_id));
create policy "qari insert students" on students for insert with check (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and class_id = students.class_id));
create policy "qari update students" on students for update using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and class_id = students.class_id));
create policy "qari reports"    on reports     for all using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = reports.student_id and s.class_id = p.class_id));
create policy "qari fee_settings" on fee_settings for select using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = fee_settings.student_id and s.class_id = p.class_id));
create policy "qari fee_payments" on fee_payments for select using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = fee_payments.student_id and s.class_id = p.class_id));
create policy "qari weekly"   on weekly_reports for select using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = weekly_reports.student_id and s.class_id = p.class_id));
create policy "qari monthly"  on monthly_reports for select using (auth.role() = 'authenticated' and exists (select 1 from profiles p, students s where p.id = auth.uid() and s.id = monthly_reports.student_id and s.class_id = p.class_id));

-- Profiles: everyone can read, only admin can update
create policy "profiles select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles update" on profiles for update using (auth.role() = 'authenticated' and (id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin')));

-- ==========================================================
-- HELPER: auto-update updated_at
-- ==========================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_students_updated_at
  before update on students
  for each row execute function public.set_updated_at();

create trigger set_fee_settings_updated_at
  before update on fee_settings
  for each row execute function public.set_updated_at();

-- ==========================================================
-- DONE — now create users via Dashboard > Authentication > Add User
-- ==========================================================