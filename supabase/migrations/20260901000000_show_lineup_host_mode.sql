-- Live show lineup with host-controlled state, powering the app's
-- Tonight List tab (NOW PERFORMING / ON DECK indicators).

create table if not exists public.show_lineup (
  id bigint generated always as identity primary key,
  show_date date not null default ((now() at time zone 'America/Los_Angeles')::date),
  position integer not null,
  name text not null,
  email text,
  set_length text,
  start_time text,
  status text not null default 'waiting'
    check (status in ('waiting', 'performing', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_date, position)
);

alter table public.show_lineup enable row level security;

-- App admins (hosts) allowed to control the lineup
create table if not exists public.app_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

insert into public.app_admins (email)
values ('vxayananh@gmail.com')
on conflict do nothing;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Lineup is readable by any signed-in comedian
create policy "lineup readable by authenticated"
  on public.show_lineup
  for select
  to authenticated
  using (true);

-- Only admins can modify the lineup
create policy "lineup writable by admins"
  on public.show_lineup
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Host taps "Next Comic": current performer -> done, next waiting -> performing
create or replace function public.advance_lineup(
  p_show_date date default ((now() at time zone 'America/Los_Angeles')::date)
)
returns setof public.show_lineup
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  update public.show_lineup
  set status = 'done', updated_at = now()
  where show_date = p_show_date and status = 'performing';

  update public.show_lineup
  set status = 'performing', updated_at = now()
  where id = (
    select id from public.show_lineup
    where show_date = p_show_date and status = 'waiting'
    order by position
    limit 1
  );

  return query
  select * from public.show_lineup
  where show_date = p_show_date
  order by position;
end;
$$;

revoke all on function public.advance_lineup(date) from public;
grant execute on function public.advance_lineup(date) to authenticated;

-- Host resets the show (everyone back to waiting)
create or replace function public.reset_lineup(
  p_show_date date default ((now() at time zone 'America/Los_Angeles')::date)
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  update public.show_lineup
  set status = 'waiting', updated_at = now()
  where show_date = p_show_date;
end;
$$;

revoke all on function public.reset_lineup(date) from public;
grant execute on function public.reset_lineup(date) to authenticated;
