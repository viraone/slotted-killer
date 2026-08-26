-- Drop old signatures to ensure no legacy or argument-based RPC remains callable
drop function if exists public.claim_pending_signup(bigint);
drop function if exists public.claim_pending_signup(text);
drop function if exists public.claim_pending_signup();

create or replace function public.claim_pending_signup()
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
  perform pg_advisory_xact_lock(hashtext('claim_signup:' || v_email));

  -- 3. Idempotency: Reuse canonical active verified signup check
  if public.has_active_verified_signup(v_email) = true then
    return true;
  end if;

  -- 4. Select only the newest eligible pending unverified signup
  select id into v_signup_id
  from public.signups
  where lower(email) = v_email
    and is_verified = false
  order by created_at desc, id desc
  limit 1;

  if v_signup_id is null then
    return false;
  end if;

  -- 5. Mark verified and link authenticated user ID
  update public.signups
  set is_verified = true,
      auth_user_id = v_user_id
  where id = v_signup_id;

  return true;
end;
$$;

-- Permissions: revoke from public/anon, grant ONLY to authenticated
revoke all on function public.claim_pending_signup() from public;
revoke all on function public.claim_pending_signup() from anon;
grant execute on function public.claim_pending_signup() to authenticated;

comment on function public.claim_pending_signup() is
  'Securely claims the latest pending signup for the authenticated JWT user. Serialized per email and callable only by authenticated users.';
