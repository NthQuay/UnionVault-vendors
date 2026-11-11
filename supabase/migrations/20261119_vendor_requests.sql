-- Vendor access requests, approvals, the admin referral ledger, and partners who only want a listing or only a referral link.
-- STATUS: not applied yet. Depends on 20261110/16/17 (main repo) and 20261112/13/18 (this repo).
-- Writers (submit / approve / deny) are for the service role only (the vendor-request and vendor-request-review edge functions);
-- the admin reads through admin_* functions. Nobody can read vendor_requests directly.

-- ── what a partner is: a login, optionally with a listing (vendor_id) and/or a referral link (referral_enabled) ─────────
alter table public.partners add column if not exists referral_enabled boolean not null default true;

-- ── the requests ───────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.vendor_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  business      text not null check (length(btrim(business)) between 1 and 100),
  email         text not null check (length(email) between 3 and 120),
  phone         text not null check (length(btrim(phone)) between 1 and 40),
  website       text check (website is null or length(website) <= 200),
  about         text not null check (length(btrim(about)) between 1 and 1000),
  want_listing  boolean not null default false,
  want_affiliate boolean not null default false,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  partner_id    uuid references public.partners(id) on delete set null,
  check (want_listing or want_affiliate)
);
create index if not exists vendor_requests_status_idx on public.vendor_requests (status, created_at desc);
create index if not exists vendor_requests_email_idx on public.vendor_requests (lower(email), created_at desc);
alter table public.vendor_requests enable row level security;      -- no policies: service role / admin functions only
revoke all on public.vendor_requests from anon, authenticated;

-- ── initials for a business name: first letter of the first two real words ("Bloom & Wild Florals" → BW) ──────────────
create or replace function public.vendor_mono(p_name text) returns text language sql immutable set search_path = public as $$
  select nullif(upper(coalesce(string_agg(left(w, 1), '' order by o), '')), '')
  from (select w, o from (select regexp_replace(x, '[^[:alnum:]]', '', 'g') as w, o
                          from unnest(regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+')) with ordinality as t(x, o)) z
        where w <> '' order by o limit 2) y;
$$;

-- the profile-change review (from 20261113) now uses it, so "Bloom & Wild" is BW there too
create or replace function public.review_profile_change(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.vendor_profile_changes; j jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'admin_only'); end if;
  select * into c from public.vendor_profile_changes where id = p_id and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
  if p_approve then
    j := c.proposed;
    update public.vendor_profiles set
      name             = coalesce(j->>'name', name),
      mono             = case when j ? 'name' and btrim(j->>'name') <> '' then public.vendor_mono(j->>'name') else mono end,
      category_label   = coalesce(j->>'category_label', category_label),
      area             = coalesce(j->>'area', area),
      hours            = coalesce(j->>'hours', hours),
      phone            = coalesce(j->>'phone', phone),
      email            = coalesce(j->>'email', email),
      bio              = coalesce(j->>'bio', bio),
      logo_path        = case when j ? 'logo_path' then nullif(j->>'logo_path', '') else logo_path end,
      photos           = coalesce(j->'photos', photos),
      packages         = coalesce(j->'packages', packages),
      packages_visible = coalesce((j->>'packages_visible')::boolean, packages_visible),
      updated_at       = now()
    where vendor_id = c.vendor_id;
    insert into public.vendor_links (vendor_id, link, url)
      select c.vendor_id, m.link, j->>m.key from (values ('website','website_url'),('contact','contact_url'),('instagram','instagram_url')) m(link, key)
      where j ? m.key and coalesce(j->>m.key, '') <> ''
    on conflict (vendor_id, link) do update set url = excluded.url, updated_at = now();
  end if;
  update public.vendor_profile_changes set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── submit (public form, via the vendor-request function) ────────────────────────────────────────────────────────────
create or replace function public.vendor_request_submit(
  p_name text, p_business text, p_email text, p_phone text, p_website text, p_about text, p_want_listing boolean, p_want_affiliate boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, ''))); id uuid;
begin
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 or length(btrim(coalesce(p_business, ''))) not between 1 and 100
     or length(btrim(coalesce(p_phone, ''))) not between 1 and 40 or length(btrim(coalesce(p_about, ''))) not between 1 and 1000
     or length(coalesce(p_website, '')) > 200 or e !~ '^[^@\s<>"'']+@[^@\s<>"'']+\.[^@\s<>"'']+$' or length(e) > 120
     or not (coalesce(p_want_listing, false) or coalesce(p_want_affiliate, false)) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if (select count(*) from public.vendor_requests where lower(email) = e and created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.vendor_requests where created_at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('status', 'throttled');
  end if;
  if exists (select 1 from public.vendor_requests where lower(email) = e and status = 'pending') then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if public.vendor_login_allowed(e) then return jsonb_build_object('status', 'already_vendor'); end if;
  insert into public.vendor_requests (name, business, email, phone, website, about, want_listing, want_affiliate)
  values (btrim(p_name), btrim(p_business), e, btrim(p_phone), nullif(btrim(coalesce(p_website, '')), ''), btrim(p_about),
          coalesce(p_want_listing, false), coalesce(p_want_affiliate, false))
  returning vendor_requests.id into id;
  return jsonb_build_object('status', 'created', 'id', id);
end $$;

-- ── the auth user for an address (the review function creates one if there is none) ───────────────────────────────────
create or replace function public.auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

-- ── approve: create the partner (+ unpublished listing when asked) and close the request ─────────────────────────────
create or replace function public.vendor_request_approve(p_id uuid, p_user_id uuid, p_admin uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.vendor_requests; base text; slug text; n int := 1; pid uuid; mono text;
begin
  select * into r from public.vendor_requests where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('status', 'not_pending'); end if;
  if exists (select 1 from public.partners where user_id = p_user_id) then return jsonb_build_object('status', 'already_partner'); end if;

  base := trim(both '-' from regexp_replace(lower(r.business), '[^a-z0-9]+', '-', 'g'));
  base := left(coalesce(nullif(base, ''), 'vendor'), 30);
  if length(base) < 3 then base := base || 'vnd'; end if;
  slug := base;
  while exists (select 1 from public.partners where code = slug or vendor_id = slug) or exists (select 1 from public.vendor_profiles where vendor_id = slug) loop
    n := n + 1; slug := left(base, 36) || '-' || n;
  end loop;

  insert into public.partners (user_id, code, name, contact_email, vendor_id, referral_enabled, rate)
  values (p_user_id, slug, r.business, r.email, case when r.want_listing then slug end, r.want_affiliate, null)
  returning id into pid;

  if r.want_listing then
    mono := public.vendor_mono(r.business);
    insert into public.vendor_profiles (vendor_id, name, category, category_label, mono, phone, email, published)
    values (slug, r.business, 'Other', 'Wedding vendor', mono, r.phone, r.email, false);
  end if;

  update public.vendor_requests set status = 'approved', reviewed_by = p_admin, reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), ''), partner_id = pid
   where id = r.id;
  return jsonb_build_object('status', 'approved', 'partner_id', pid, 'code', slug, 'want_listing', r.want_listing, 'want_affiliate', r.want_affiliate);
end $$;

create or replace function public.vendor_request_deny(p_id uuid, p_admin uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.vendor_requests;
begin
  select * into r from public.vendor_requests where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('status', 'not_pending'); end if;
  update public.vendor_requests set status = 'denied', reviewed_by = p_admin, reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
  return jsonb_build_object('status', 'denied');
end $$;

-- ── admin lists ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_vendor_requests()
returns table (id uuid, status text, created_at timestamptz, name text, business text, email text, phone text, website text, about text,
               want_listing boolean, want_affiliate boolean, reviewed_at timestamptz, review_note text)
language sql stable security definer set search_path = public as $$
  select v.id, v.status, v.created_at, v.name, v.business, v.email, v.phone, v.website, v.about, v.want_listing, v.want_affiliate, v.reviewed_at, v.review_note
  from public.vendor_requests v where public.is_admin()
  order by (v.status = 'pending') desc, v.created_at desc limit 200;
$$;

-- Admin: one partner's referred clients, with real emails (partners only ever see the anonymous ID).
create or replace function public.admin_partner_clients(p_partner uuid)
returns table (email text, anon_id text, signed_up_at timestamptz, plan_months int, plan_amount_cents bigint, subscription_status text, cancel_state text)
language sql stable security definer set search_path = public as $$
  select u.email::text, substr(md5(coalesce(r.user_id, r.id)::text), 1, 8), r.signed_up_at, lp.plan_months, lp.amount_cents, coalesce(s.status, 'none'),
         case lc.kind when 'cancel_requested' then 'requested' when 'cancelled' then 'ended' else null end
  from public.referrals r
  left join auth.users u on u.id = r.user_id
  left join public.subscriptions s on s.user_id = r.user_id
  left join lateral (select e.plan_months, e.amount_cents from public.referral_events e where e.referral_id = r.id and e.kind = 'payment' order by e.occurred_at desc limit 1) lp on true
  left join lateral (select e.kind from public.referral_events e where e.referral_id = r.id and e.kind in ('cancel_requested', 'resumed', 'cancelled') order by e.occurred_at desc limit 1) lc on true
  where public.is_admin() and r.partner_id = p_partner and r.status = 'attributed'
  order by r.signed_up_at desc;
$$;

-- Admin: every ledger line for a partner (all time, or one calendar quarter), with the client's email.
create or replace function public.admin_partner_ledger(p_partner uuid, p_period date default null)
returns table (occurred_at timestamptz, email text, anon_id text, kind text, plan_months int, paid_cents bigint, commission_cents bigint, status text)
language sql stable security definer set search_path = public as $$
  with money as (
    select ce.occurred_at, ce.referral_id,
      case when ce.kind = 'reversal' then 'reversal'
           when row_number() over (partition by ce.referral_id order by ce.occurred_at) = 1 and ce.kind = 'payment' then 'first'
           else 'renewal' end as kind,
      ce.plan_months, ce.gross_cents - ce.tax_cents as paid_cents, ce.commission_cents, ce.status, ce.period_start
    from public.commission_entries ce where ce.partner_id = p_partner),
  events as (
    select e.occurred_at, e.referral_id, e.kind, e.plan_months, 0::bigint as paid_cents, 0::bigint as commission_cents, ''::text as status,
           public.affiliate_quarter_start(e.occurred_at) as period_start
    from public.referral_events e join public.referrals r on r.id = e.referral_id
    where r.partner_id = p_partner and e.kind <> 'payment')
  select x.occurred_at, u.email::text, substr(md5(coalesce(r.user_id, r.id)::text), 1, 8), x.kind, x.plan_months, x.paid_cents, x.commission_cents, x.status
  from (select * from money union all select * from events) x
  join public.referrals r on r.id = x.referral_id
  left join auth.users u on u.id = r.user_id
  where public.is_admin() and (p_period is null or x.period_start = p_period)
  order by x.occurred_at;
$$;

-- ── referral links only work for partners who asked for one ───────────────────────────────────────────────────────
create or replace function public.claim_referral(p_code text, p_clicked_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users;
  v_partner public.partners;
  s         public.affiliate_settings;
  v_click   timestamptz;
  v_status  text := 'attributed';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into s from public.affiliate_settings where id = 1;
  if exists (select 1 from public.referrals where user_id = v_uid) then
    return jsonb_build_object('ok', true, 'status', 'already_claimed');
  end if;
  select * into v_partner from public.partners where code = lower(btrim(coalesce(p_code, ''))) and active and referral_enabled;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  select * into v_user from auth.users where id = v_uid;
  if v_user.created_at < now() - make_interval(hours => s.new_account_window_hours) then
    return jsonb_build_object('ok', false, 'error', 'existing_account');
  end if;
  v_click := least(coalesce(p_clicked_at, v_user.created_at), now());
  if v_click > v_user.created_at + interval '10 minutes' then
    return jsonb_build_object('ok', false, 'error', 'existing_account');
  end if;
  if v_click < now() - make_interval(days => s.attribution_window_days) then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_partner.user_id = v_uid or (v_partner.contact_email is not null and lower(v_user.email) = lower(v_partner.contact_email)) then
    v_status := 'excluded_self';
  end if;
  insert into public.referrals (user_id, partner_id, code, clicked_at, signed_up_at, status)
  values (v_uid, v_partner.id, v_partner.code, v_click, v_user.created_at, v_status)
  on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;
revoke all on function public.claim_referral(text, timestamptz) from public, anon;
grant execute on function public.claim_referral(text, timestamptz) to authenticated;

-- ── the portal needs to know which parts a partner has ───────────────────────────────────────────────────────────
create or replace function public.partner_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_partner public.partners;
begin
  select * into v_partner from public.partners where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'name', v_partner.name, 'code', v_partner.code, 'rate', v_partner.rate,
    'has_listing', v_partner.vendor_id is not null, 'referral_enabled', v_partner.referral_enabled,
    'signups', (select count(*) from public.referrals r where r.partner_id = v_partner.id and r.status = 'attributed'),
    'active_subscribers', (select count(*) from public.referrals r join public.subscriptions s on s.user_id = r.user_id
                            where r.partner_id = v_partner.id and r.status = 'attributed' and s.status = 'active'),
    'earned_cents',  coalesce((select sum(commission_cents) from public.commission_entries where partner_id = v_partner.id), 0),
    'unpaid_cents',  coalesce((select sum(commission_cents) from public.commission_entries where partner_id = v_partner.id and status <> 'paid'), 0),
    'paid_cents',    coalesce((select sum(commission_cents) from public.commission_entries where partner_id = v_partner.id and status = 'paid'), 0));
end $$;

-- ── privileges ────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.vendor_request_submit(text, text, text, text, text, text, boolean, boolean), public.auth_user_id_by_email(text),
  public.vendor_request_approve(uuid, uuid, uuid, text), public.vendor_request_deny(uuid, uuid, text),
  public.admin_vendor_requests(), public.admin_partner_clients(uuid), public.admin_partner_ledger(uuid, date) from public, anon, authenticated;
grant execute on function public.vendor_request_submit(text, text, text, text, text, text, boolean, boolean), public.auth_user_id_by_email(text),
  public.vendor_request_approve(uuid, uuid, uuid, text), public.vendor_request_deny(uuid, uuid, text) to service_role;
grant execute on function public.admin_vendor_requests(), public.admin_partner_clients(uuid), public.admin_partner_ledger(uuid, date) to authenticated;
