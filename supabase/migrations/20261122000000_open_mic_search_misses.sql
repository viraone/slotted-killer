-- City search on stagetimepnw.com: a search that finds no open mic is logged,
-- so we can see which cities, venues and hosts people look for that the list
-- does not have yet.
--
-- The browser calls the log_open_mic_search_miss RPC with the anon key about
-- 2.5 seconds after the visitor stops typing. It cannot read or write the
-- table directly. Only the search text is stored: no IP address, no user, no
-- page URL. Admins (app_admins, see 20260901000000) can read the table and the
-- open_mic_search_miss_counts view.

create table if not exists public.open_mic_search_misses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  query text not null check (char_length(query) between 3 and 60)
);

comment on table public.open_mic_search_misses is
  'Searches on stagetimepnw.com that found no open mic. Search text only; written by log_open_mic_search_miss.';

create index if not exists open_mic_search_misses_created_idx
  on public.open_mic_search_misses (created_at);

alter table public.open_mic_search_misses enable row level security;

-- The RPC below writes; admins read. The browser never touches the table.
revoke all on table public.open_mic_search_misses from anon, authenticated;
grant all on table public.open_mic_search_misses to service_role;
grant select on table public.open_mic_search_misses to authenticated;

drop policy if exists "admins read search misses" on public.open_mic_search_misses;
create policy "admins read search misses"
  on public.open_mic_search_misses
  for select
  to authenticated
  using (public.is_app_admin());

-- Lower-cases and tidies the text, ignores anything shorter than 3 or longer
-- than 60 characters, and stops writing after 2000 rows in a day so the public
-- endpoint cannot be used to fill the table.
create or replace function public.log_open_mic_search_miss(p_query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
begin
  if char_length(v_query) < 3 or char_length(v_query) > 60 then
    return;
  end if;

  if (
    select count(*)
    from public.open_mic_search_misses
    where created_at > now() - interval '1 day'
  ) >= 2000 then
    return;
  end if;

  insert into public.open_mic_search_misses (query) values (v_query);
end;
$$;

revoke all on function public.log_open_mic_search_miss(text) from public;
grant execute on function public.log_open_mic_search_miss(text) to anon, authenticated, service_role;

-- What people searched for and did not find, most wanted first.
create or replace view public.open_mic_search_miss_counts
with (security_invoker = true) as
select
  query,
  count(*) as searches,
  max(created_at) as last_searched
from public.open_mic_search_misses
group by query
order by searches desc, last_searched desc;

revoke all on table public.open_mic_search_miss_counts from anon, authenticated;
grant select on table public.open_mic_search_miss_counts to authenticated, service_role;
