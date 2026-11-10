-- A partner's referral rate can be "not yet agreed" (NULL). The portal then shows "to be agreed", and the
-- (parked) commission code must refuse to create commission entries for a partner whose rate is NULL.
-- STATUS: applied to production on 2026-11-10 (Jordan Leef Photography set to NULL, Storyline 20%).
alter table public.partners alter column rate drop not null;
alter table public.partners alter column rate drop default;
update public.partners set rate = null, updated_at = now() where code = 'jordanleef';
