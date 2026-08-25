create table if not exists public.signup_sheet_sync (
  signup_id bigint primary key references public.signups(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sheet_synced_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signup_sheet_sync_completion_consistent check (
    status <> 'completed'
    or (sheet_synced_at is not null and email_sent_at is not null)
  )
);

alter table public.signup_sheet_sync enable row level security;

revoke all on table public.signup_sheet_sync from anon, authenticated;
grant all on table public.signup_sheet_sync to service_role;

create or replace function public.enqueue_verified_signup_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.is_verified is distinct from true and new.is_verified = true then
    insert into public.signup_sheet_sync (signup_id)
    values (new.id)
    on conflict (signup_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_verified_signup_sync() from public;

drop trigger if exists tr_enqueue_verified_signup_sync on public.signups;
create trigger tr_enqueue_verified_signup_sync
after update of is_verified on public.signups
for each row
execute function public.enqueue_verified_signup_sync();

create or replace function public.claim_signup_sheet_sync_jobs(
  p_limit integer default 10,
  p_lease_timeout interval default interval '10 minutes'
)
returns setof public.signup_sheet_sync
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;

  return query
  with claimable as (
    select sync.signup_id
    from public.signup_sheet_sync as sync
    where sync.status in ('pending', 'retry')
       or (
         sync.status = 'processing'
         and sync.updated_at < now() - p_lease_timeout
       )
    order by sync.created_at, sync.signup_id
    for update skip locked
    limit p_limit
  )
  update public.signup_sheet_sync as sync
  set status = 'processing',
      attempts = sync.attempts + 1,
      last_error = null,
      updated_at = now()
  from claimable
  where sync.signup_id = claimable.signup_id
  returning sync.*;
end;
$$;

revoke all on function public.claim_signup_sheet_sync_jobs(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_signup_sheet_sync_jobs(integer, interval) to service_role;

comment on table public.signup_sheet_sync is
  'Internal durable outbox for verified signup Google Sheets and notification delivery.';
comment on function public.enqueue_verified_signup_sync() is
  'Enqueues one job only when a signup transitions from not verified to verified.';
comment on function public.claim_signup_sheet_sync_jobs(integer, interval) is
  'Claims retryable jobs using row locks and recovers abandoned processing leases.';
