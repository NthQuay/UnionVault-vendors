// Public "request vendor access" form. Validates, stores the request (service role, via vendor_request_submit) and emails
// the admin. It never emails the applicant (so it cannot be used to send mail to other people). Deploy with verify_jwt = false.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminAlertEmail } from '../_shared/vendor-email.ts'
import { sendMail } from '../_shared/vendor-review.ts'

const ADMIN_EMAIL = 'admin@unionvault.app'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization' }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false })
  const sbUrl = Deno.env.get('SUPABASE_URL') ?? '', sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!sbUrl || !sbKey) return reply(503, { ok: false, error: 'Not configured' })
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { return reply(400, { ok: false, error: 'bad_json' }) }
  const f = { name: str(b.name, 100), business: str(b.business, 120), email: str(b.email, 140), phone: str(b.phone, 60), website: str(b.website, 220), about: str(b.about, 1200), l: b.want_listing === true, a: b.want_affiliate === true }
  try {
    const r = await (await fetch(`${sbUrl}/rest/v1/rpc/vendor_request_submit`, {
      method: 'POST', headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_name: f.name, p_business: f.business, p_email: f.email, p_phone: f.phone, p_website: f.website, p_about: f.about, p_want_listing: f.l, p_want_affiliate: f.a }),
    })).json()
    if (r?.status === 'invalid') return reply(400, { ok: false, error: 'invalid' })
    if (r?.status === 'throttled') return reply(429, { ok: false, error: 'try_later' })
    if (r?.status === 'created' && resendKey) {
      await sendMail({ fetch, sbUrl, sbKey, resendKey }, ADMIN_EMAIL, adminAlertEmail({ name: f.name.trim(), business: f.business.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), website: f.website.trim(), about: f.about.trim(), wantListing: f.l, wantAffiliate: f.a }))
    }
  } catch (e) { console.error('vendor-request error', e); return reply(500, { ok: false, error: 'server_error' }) }
  return reply(200, { ok: true })            // the same answer for created / duplicate / already a vendor
})
