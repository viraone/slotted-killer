-- "You're in" emails for comics selected for Friday's Read The Room show.
-- The notify-selected function emails each selected comic once per show and
-- records it here. It does nothing until selection_emails_enabled is true.

create table if not exists public.selection_notifications (
  email text not null,
  show_date date not null,
  name text,
  sent_at timestamptz not null default now(),
  primary key (email, show_date)
);

alter table public.selection_notifications enable row level security;
-- No policies: only the service role (the function) can read or write.
revoke all on public.selection_notifications from anon, authenticated;

insert into public.app_settings (key, value)
values ('selection_emails_enabled', false)
on conflict (key) do nothing;

-- Check the sheet every 2 minutes. Same secret and pattern as the signup sync.
select cron.schedule(
  'notify-selected-comics',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ldodkbdzljfpbnzrpxpu.supabase.co/functions/v1/notify-selected',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_function_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
