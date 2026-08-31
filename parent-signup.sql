-- ============================================================
-- Parent self-signup support
-- Paste into Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1) Auto-confirm new auth users on signup (no email verification).
--    @madrasa.com has no real inbox, so confirmation emails can never
--    be received. Setting email_confirmed_at before insert means GoTrue
--    returns a live session immediately and parents are logged in.
create or replace function public.auto_confirm_new_user()
returns trigger as $$
begin
  new.email_confirmed_at := now();
  new.confirmed_at := now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_autoconfirm on auth.users;
create trigger on_auth_user_created_autoconfirm
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();

-- 2) Harden profile creation:
--    - Only accept role 'parent' from public signup metadata; everything
--      else becomes 'qari'. This blocks privilege escalation to 'admin'.
--    - Reject signups with emails that don't end in @madrasa.com
--      (the exception rolls back the auth.users insert).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if new.email is null or new.email !~ '@madrasa\.com$' then
    raise exception 'Email must be a @madrasa.com address';
  end if;
  insert into public.profiles (id, name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'role' = 'parent' then 'parent' else 'qari' end,
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 3) Parents need read access to class names (for the parent dashboard
--    "Class: ..." label) and to their own child's student row.
create policy "parent classes" on classes
  for select using (auth.role() = 'authenticated' and exists (select 1 from profiles where id = auth.uid() and role = 'parent'));

-- 4) Parents need read access to fee settings + payments for their own children.
drop policy if exists "parent fee_settings" on fee_settings;
create policy "parent fee_settings" on fee_settings for select using (
  exists (select 1 from students s where s.id = fee_settings.student_id and s.parent_id = auth.uid())
);

drop policy if exists "parent fee_payments" on fee_payments;
create policy "parent fee_payments" on fee_payments for select using (
  exists (select 1 from students s where s.id = fee_payments.student_id and s.parent_id = auth.uid())
);
