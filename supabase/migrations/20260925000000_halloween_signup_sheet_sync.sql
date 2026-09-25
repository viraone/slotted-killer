-- Google Sheet sync for Halloween Costume Contest sign-ups.
--
-- Mirrors the Friday outbox in 20260822000000_signup_sync.sql, but kept
-- separate so the Friday sync is untouched: when a halloween_signups row
-- becomes verified, one job lands in halloween_signup_sheet_sync; the
-- sync-verified-halloween-signup edge function (called every minute by the
-- cron job below) claims jobs and appends one row per verified sign-up to the
-- sheet in the HALLOWEEN_GOOGLE_SHEET_ID secret. No notification email.

create table if not exists public.halloween_signup_sheet_sync (
  signup_id bigint primary key references public.halloween_signups(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint halloween_signup_sheet_sync_completion_consistent check (
    status <> 'completed' or sheet_synced_at is not null
  )
);

alter table public.halloween_signup_sheet_sync enable row level security;

revoke all on table public.halloween_signup_sheet_sync from anon, authenticated;
grant all on table public.halloween_signup_sheet_sync to service_role;

create or replace function public.enqueue_verified_halloween_signup_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_verified = true
     and (tg_op = 'INSERT' or old.is_verified is distinct from true) then
    insert into public.halloween_signup_sheet_sync (signup_id)
    values (new.id)
    on conflict (signup_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_verified_halloween_signup_sync() from public;

drop trigger if exists tr_enqueue_verified_halloween_signup_sync on public.halloween_signups;
create trigger tr_enqueue_verified_halloween_signup_sync
after insert or update of is_verified on public.halloween_signups
for each row
execute function public.enqueue_verified_halloween_signup_sync();

create or replace function public.claim_halloween_signup_sheet_sync_jobs(
  p_limit integer default 10,
  p_lease_timeout interval default interval '10 minutes'
)
returns setof public.halloween_signup_sheet_sync
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
    from public.halloween_signup_sheet_sync as sync
    where sync.status in ('pending', 'retry')
       or (
         sync.status = 'processing'
         and sync.updated_at < now() - p_lease_timeout
       )
    order by sync.created_at, sync.signup_id
    for update skip locked
    limit p_limit
  )
  update public.halloween_signup_sheet_sync as sync
  set status = 'processing',
      attempts = sync.attempts + 1,
      last_error = null,
      updated_at = now()
  from claimable
  where sync.signup_id = claimable.signup_id
  returning sync.*;
end;
$$;

revoke all on function public.claim_halloween_signup_sheet_sync_jobs(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_halloween_signup_sheet_sync_jobs(integer, interval) to service_role;

-- Backfill anything verified before this migration ran.
insert into public.halloween_signup_sheet_sync (signup_id)
select id from public.halloween_signups where is_verified = true
on conflict (signup_id) do nothing;

-- Call the edge function every minute, reusing the Friday sync's shared
-- secret from Vault. cron.schedule upserts by job name.
select cron.schedule(
  'sync-verified-halloween-signups',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ldodkbdzljfpbnzrpxpu.supabase.co/functions/v1/sync-verified-halloween-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_function_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

comment on table public.halloween_signup_sheet_sync is
  'Internal durable outbox for verified Halloween sign-up Google Sheets delivery.';
