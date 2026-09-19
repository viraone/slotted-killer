-- Halloween Costume Contest sign-up form (Rickshaw Lounge).
--
-- Mirrors the Friday "Read The Room" flow (public.signups /
-- has_active_verified_signup / claim_pending_signup from
-- 20260825000000_claim_pending_signup_authenticated.sql): the browser inserts
-- directly into this table with the anon key, then verifies the email with
-- Supabase Auth's OTP magic link, landing on /?verify=1&kind=halloween which
-- calls claim_pending_halloween_signup() to mark the row verified. Kept in
-- its own table so these submissions never mix with the Friday show's list.
--
-- Submissions are closed until public.is_halloween_signups_open() returns
-- true. That single setting lives in public.app_settings and gates both
-- sides at once: the browser reads it to enable the form / banner, and the
-- tr_enforce_halloween_signups_open trigger below reads the exact same
-- function to reject inserts while it's false — so there's no way for the
-- two to drift out of sync the way a separate frontend flag and backend
-- flag could.
--
-- To open sign-ups, run:
--   update public.app_settings set value = true, updated_at = now()
--   where key = 'halloween_signups_open';
-- (or, while signed in as an app admin: select public.set_halloween_signups_open(true);)
-- To close them again, set value back to false the same way.

create table if not exists public.app_settings (
  key text primary key,
  value boolean not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Small key/value settings store for site-wide toggles, e.g. halloween_signups_open.';

alter table public.app_settings enable row level security;

-- Locked down entirely; readable only through the security-definer functions
-- below (same pattern as public.app_admins).
revoke all on table public.app_settings from anon, authenticated;
grant all on table public.app_settings to service_role;

insert into public.app_settings (key, value)
values ('halloween_signups_open', false)
on conflict (key) do nothing;

create or replace function public.is_halloween_signups_open()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select value from public.app_settings where key = 'halloween_signups_open'),
    false
  );
$$;

revoke all on function public.is_halloween_signups_open() from public;
grant execute on function public.is_halloween_signups_open() to anon, authenticated;

-- Convenience toggle for app admins (see public.is_app_admin(), added in
-- 20260901000000_show_lineup_host_mode.sql) so the flag can be flipped from
-- the browser console instead of the SQL editor:
--   supabaseClient.rpc('set_halloween_signups_open', { p_open: true })
create or replace function public.set_halloween_signups_open(p_open boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('halloween_signups_open', p_open, now())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_halloween_signups_open(boolean) from public;
grant execute on function public.set_halloween_signups_open(boolean) to authenticated;

create table if not exists public.halloween_signups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  instagram text check (instagram is null or char_length(instagram) <= 100),
  performed_before boolean not null,
  costume text not null check (char_length(costume) between 1 and 200),
  costume_agreement boolean not null,
  vote_agreement boolean not null,
  no_show_agreement boolean not null,
  guarantee_agreement boolean not null,
  is_verified boolean not null default false,
  auth_user_id uuid
);

comment on table public.halloween_signups is
  'Halloween Costume Contest sign-up requests, kept separate from public.signups (the Friday show).';

alter table public.halloween_signups enable row level security;

-- Only INSERT is exposed to the browser (checking/claiming go through the
-- security-definer RPCs below, which bypass RLS on purpose).
revoke all on table public.halloween_signups from anon, authenticated;
grant insert on table public.halloween_signups to anon, authenticated;
grant all on table public.halloween_signups to service_role;

create policy "halloween signups insertable by anyone"
  on public.halloween_signups
  for insert
  to anon, authenticated
  with check (true);

-- Backend half of the single open/closed setting: even if someone bypasses
-- the disabled form in devtools and calls the insert directly, this trigger
-- still blocks it with a clear, friendly error and nothing is saved.
create or replace function public.enforce_halloween_signups_open()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_halloween_signups_open() then
    raise exception 'Sign ups are not open yet';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_halloween_signups_open() from public;

drop trigger if exists tr_enforce_halloween_signups_open on public.halloween_signups;
create trigger tr_enforce_halloween_signups_open
before insert on public.halloween_signups
for each row
execute function public.enforce_halloween_signups_open();

create or replace function public.has_active_verified_halloween_signup(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.halloween_signups
    where lower(email) = lower(trim(p_email))
      and is_verified = true
  );
$$;

revoke all on function public.has_active_verified_halloween_signup(text) from public;
grant execute on function public.has_active_verified_halloween_signup(text) to anon, authenticated;

create or replace function public.claim_pending_halloween_signup()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_user_id uuid;
  v_signup_id bigint;
begin
  -- 1. Derive identity strictly from authenticated JWT
  v_user_id := auth.uid();
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  if v_user_id is null or v_email = '' then
    return false;
  end if;

  -- 2. Transaction-level advisory lock serializes concurrent claims for this specific email
  perform pg_advisory_xact_lock(hashtext('claim_halloween_signup:' || v_email));

  -- 3. Idempotency: reuse the canonical active verified signup check
  if public.has_active_verified_halloween_signup(v_email) = true then
    return true;
  end if;

  -- 4. Select only the newest eligible pending unverified signup
  select id into v_signup_id
  from public.halloween_signups
  where lower(email) = v_email
    and is_verified = false
  order by created_at desc, id desc
  limit 1;

  if v_signup_id is null then
    return false;
  end if;

  -- 5. Mark verified and link authenticated user ID
  update public.halloween_signups
  set is_verified = true,
      auth_user_id = v_user_id
  where id = v_signup_id;

  return true;
end;
$$;

revoke all on function public.claim_pending_halloween_signup() from public;
revoke all on function public.claim_pending_halloween_signup() from anon;
grant execute on function public.claim_pending_halloween_signup() to authenticated;

comment on function public.claim_pending_halloween_signup() is
  'Securely claims the latest pending Halloween Costume Contest signup for the authenticated JWT user. Serialized per email and callable only by authenticated users.';
