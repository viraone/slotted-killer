-- "Report a change" on stagetimepnw.com: anyone can tell the admin that an open
-- mic was cancelled for a date, closed for good, changed time or venue, etc.
--
-- The form posts to the report-open-mic-change edge function, which validates
-- the payload, inserts the row with the service role, and emails the admin via
-- Resend. Nothing but service_role can write this table. Admins (app_admins,
-- see 20260901000000) read the queue in the ?admin=1 panel and mark each report
-- accepted or dismissed through a security-definer RPC. Accepting a report only
-- records the decision; the data fix itself (data/open-mics.json or
-- published_open_mics) is made by hand afterwards.

create table if not exists public.open_mic_change_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),

  -- Review workflow (admin-only columns; the form cannot set these)
  status text not null default 'new'
    check (status in ('new', 'accepted', 'dismissed')),
  reviewed_at timestamptz,
  review_notes text,

  -- Admin email notification, set by the report-open-mic-change edge function
  notified_at timestamptz,
  notify_error text,

  -- What changed
  mic_id text check (mic_id is null or char_length(mic_id) <= 200),
  mic_name text not null check (char_length(mic_name) between 1 and 160),
  show_date date,
  change_type text not null
    check (change_type in ('not_this_date', 'closed_for_good', 'time_change', 'venue_change', 'other')),
  comment text not null check (char_length(comment) between 1 and 2000),

  -- Optional, never shown publicly
  reporter_email text check (reporter_email is null or char_length(reporter_email) between 3 and 254),
  page_url text check (page_url is null or char_length(page_url) <= 1000)
);

comment on table public.open_mic_change_reports is
  'Reports from the public "Report a change" form: a mic cancelled, closed, moved or retimed. Reviewed in the admin panel.';

create index if not exists open_mic_change_reports_status_created_idx
  on public.open_mic_change_reports (status, created_at);

alter table public.open_mic_change_reports enable row level security;

-- Service role writes; admins read. The browser never inserts directly.
revoke all on table public.open_mic_change_reports from anon, authenticated;
grant all on table public.open_mic_change_reports to service_role;
grant select on table public.open_mic_change_reports to authenticated;

drop policy if exists "admins read change reports" on public.open_mic_change_reports;
create policy "admins read change reports"
  on public.open_mic_change_reports
  for select
  to authenticated
  using (public.is_app_admin());

create or replace function public.review_open_mic_change_report(
  p_report_id bigint,
  p_status text,
  p_notes text default null
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
  if p_status not in ('new', 'accepted', 'dismissed') then
    raise exception 'Unsupported review status: %', p_status;
  end if;

  update public.open_mic_change_reports
  set status = p_status,
      review_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), review_notes),
      reviewed_at = case when p_status = 'new' then null else now() end
  where id = p_report_id;

  if not found then
    raise exception 'Change report % was not found', p_report_id;
  end if;
end;
$$;

revoke all on function public.review_open_mic_change_report(bigint, text, text) from public, anon;
grant execute on function public.review_open_mic_change_report(bigint, text, text) to authenticated;

comment on function public.review_open_mic_change_report(bigint, text, text) is
  'Marks a change report accepted/dismissed, or back to new. Admins only.';
