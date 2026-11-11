-- Vendor portal sign-in: who may receive a sign-in email, and a throttle. Used only by the vendor-signin edge function (service role).
-- STATUS: not applied yet.
create table if not exists public.vendor_login_log (
  id         bigserial primary key,
  email_hash text not null,                       -- md5 of the lower-cased address: enough to rate-limit, not a mailing list
  created_at timestamptz not null default now()
);
create index if not exists vendor_login_log_idx on public.vendor_login_log (email_hash, created_at);
alter table public.vendor_login_log enable row level security;     -- no policies: service role only
revoke all on public.vendor_login_log from anon, authenticated;

-- true only for an active partner (vendor / affiliate) or an admin
create or replace function public.vendor_login_allowed(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and (exists (select 1 from public.partners p where p.user_id = u.id and p.active)
        or exists (select 1 from public.app_admins a where a.user_id = u.id)));
$$;

-- records an attempt and says whether to proceed: at most 3 per address per 15 minutes, 150 per hour overall
create or replace function public.vendor_login_throttle(p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
declare h text := md5(lower(btrim(p_email))); n_addr int; n_all int;
begin
  delete from public.vendor_login_log where created_at < now() - interval '1 day';
  select count(*) into n_addr from public.vendor_login_log where email_hash = h and created_at > now() - interval '15 minutes';
  select count(*) into n_all  from public.vendor_login_log where created_at > now() - interval '1 hour';
  insert into public.vendor_login_log (email_hash) values (h);
  return n_addr < 3 and n_all < 150;
end $$;

revoke all on function public.vendor_login_allowed(text), public.vendor_login_throttle(text) from public, anon, authenticated;
grant execute on function public.vendor_login_allowed(text), public.vendor_login_throttle(text) to service_role;
