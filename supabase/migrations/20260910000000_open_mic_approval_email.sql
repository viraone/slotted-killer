-- Separate from the notification sent to the admin on initial submission.
alter table public.open_mic_submissions
  add column if not exists approval_notified_at timestamptz;
