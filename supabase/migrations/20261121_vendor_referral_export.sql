-- Admin-only export: a vendor's recommended-link clicks, joined to the clicking couple's name
-- and email, for vendors with a signed referral-commission agreement in the OTHER direction
-- (the vendor pays Union Vault a commission on bookings — not the vendor_clicks/referrals/
-- commission_entries machinery above, which is Union Vault paying the vendor). Today that's
-- Storyline Ceremonies only. The admin UI restricts the vendor picker to agreed partners;
-- this function itself only restricts to admins — same style as admin_recent_clicks above.
--
-- Already applied directly to the shared project (idempotent create-or-replace, so re-running
-- this file is a no-op); this migration exists so the function's source of truth lives in the
-- repo that actually uses it, per this repo's README ("Everything portal-specific lives here").

create or replace function public.admin_vendor_referral_export(vendor text, from_ts timestamptz, to_ts timestamptz)
returns table (
  clicked_at timestamptz,
  link       text,
  partner1   text,
  partner2   text,
  email      text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    c.clicked_at,
    c.link,
    nullif(trim(ev.data->>'partner1'), ''),
    nullif(trim(ev.data->>'partner2'), ''),
    coalesce(
      nullif(trim(st.data->>'userEmail'), ''),
      (select u.email from auth.users u where u.id = c.user_id)
    )
  from public.vendor_clicks c
  left join public.planner_data ev on ev.user_id = c.user_id and ev.section = 'event'
  left join public.planner_data st on st.user_id = c.user_id and st.section = 'settings'
  where public.is_admin()
    and c.vendor_id = vendor
    and c.clicked_at >= from_ts and c.clicked_at < to_ts
    and not c.is_bot
    and c.user_id is not null
  order by c.clicked_at desc;
$function$;

revoke all on function public.admin_vendor_referral_export(text, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.admin_vendor_referral_export(text, timestamptz, timestamptz) to authenticated;
