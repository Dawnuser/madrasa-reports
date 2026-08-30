-- ============================================================
-- Madrasa Reports — Phases 3–9 schema migration
-- Paste into Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Phase 3: Class types (hifz / tilawa / qaida)
alter table classes add column if not exists type text;
alter table classes drop constraint if exists classes_type_check;
alter table classes add constraint classes_type_check check (type in ('hifz', 'tilawa', 'qaida'));

-- set the correct types for the six classes
update classes set type = 'hifz'   where lower(name) like '%atta%' or lower(name) like '%anees%' or lower(name) like '%hussain%';
update classes set type = 'tilawa' where lower(name) like '%taj%' or lower(name) like '%ahsan%';
update classes set type = 'qaida'  where lower(name) like '%osama%';

-- Phase 4: Per-student track override (null = follow class type)
alter table students add column if not exists type text;
alter table students drop constraint if exists students_type_check;
alter table students add constraint students_type_check check (type in ('hifz', 'tilawa', 'qaida'));

-- Phase 4b: Shift assignment (tilawa/qaida students only; hifz use full_time)
alter table students add column if not exists shift text;
alter table students drop constraint if exists students_shift_check;
alter table students add constraint students_shift_check check (shift in ('sh1', 'sh2', 'sh3', 'sh4'));

-- Phase 5: Attendance "present with late"
alter table reports add column if not exists late boolean not null default false;

-- Phase 6: Manzil pages+lines (Tilawa) alongside half/third/full (Hifz)
alter table reports add column if not exists manzil_pages int;
alter table reports add column if not exists manzil_lines int;

-- Phase 9: Parent portal — role + link
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'qari', 'parent'));

alter table students add column if not exists invite_code text unique;
alter table students add column if not exists parent_id uuid references auth.users(id) on delete set null;

-- invite code lookup + claim as security-definer functions (keeps student data locked down)
create or replace function public.lookup_invite(code text)
returns table (sid uuid, sname text, scid uuid)
language plpgsql security definer set search_path = public
as $$
begin
  return query select s.id, s.name, s.class_id from students s
    where s.invite_code = code and s.parent_id is null limit 1;
end $$;

create or replace function public.claim_invite(code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare sid uuid; pid uuid;
begin
  pid := auth.uid();
  if pid is null then return false; end if;
  select s.id into sid from students s where s.invite_code = code and s.parent_id is null limit 1;
  if sid is null then return false; end if;
  update students set parent_id = pid where id = sid;
  update profiles set role = 'parent' where id = pid;
  return true;
end $$;

grant execute on function public.lookup_invite(text) to anon, authenticated;
grant execute on function public.claim_invite(text) to authenticated;

-- generate invite codes for all students that don't have one (admin/principal can re-run)
do $$
declare r record;
begin
  for r in select id from students where invite_code is null loop
    update students set invite_code = upper(substr(md5(r.id::text || clock_timestamp()::text), 1, 8)) where id = r.id;
  end loop;
end $$;

-- RLS: parents can read only their own linked kids' data
drop policy if exists "parent students" on students;
create policy "parent students" on students for select using (
  auth.role() = 'authenticated'
  and exists (select 1 from profiles where id = auth.uid() and role = 'parent' and students.parent_id = auth.uid())
);

drop policy if exists "parent reports" on reports;
create policy "parent reports" on reports for select using (
  auth.role() = 'authenticated'
  and exists (select 1 from profiles p, students s
    where p.id = auth.uid() and p.role = 'parent' and s.id = reports.student_id and s.parent_id = auth.uid())
);

drop policy if exists "parent weekly" on weekly_reports;
create policy "parent weekly" on weekly_reports for select using (
  auth.role() = 'authenticated'
  and exists (select 1 from profiles p, students s
    where p.id = auth.uid() and p.role = 'parent' and s.id = weekly_reports.student_id and s.parent_id = auth.uid())
);

drop policy if exists "parent monthly" on monthly_reports;
create policy "parent monthly" on monthly_reports for select using (
  auth.role() = 'authenticated'
  and exists (select 1 from profiles p, students s
    where p.id = auth.uid() and p.role = 'parent' and s.id = monthly_reports.student_id and s.parent_id = auth.uid())
);