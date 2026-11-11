// Vendor portal sign-in email. The portal posts { email }; if that address belongs to an active vendor/partner or an admin,
// we create a one-time Supabase magic link with the admin API and email it ourselves through Resend, from
// "Union Vault Vendors <vendors@unionvault.app>". We never reveal whether an address exists: the answer is always the same.
// Deploy with verify_jwt = false (the visitor is not signed in yet). Needs the project secrets RESEND_API_KEY (already set).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { FROM, isEmail, isSafeLink, signinEmail } from './email.ts'

const PORTAL = 'https://vendors.unionvault.app/'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization' }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const GENERIC = { ok: true }   // same answer whether or not the address exists

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false })
  const SB_URL = Deno.env.get('SUPABASE_URL') ?? '', SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!SB_URL || !SB_KEY || !RESEND) return reply(503, { ok: false, error: 'Not configured' })

  let email = ''
  try { email = String((await req.json())?.email ?? '').trim().toLowerCase() } catch { return reply(400, { ok: false }) }
  if (!isEmail(email)) return reply(400, { ok: false, error: 'bad_email' })

  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
  try {
    // 1. Throttle (per address and overall), then 2. only known vendor / admin accounts get an email.
    const t = await (await fetch(`${SB_URL}/rest/v1/rpc/vendor_login_throttle`, { method: 'POST', headers: h, body: JSON.stringify({ p_email: email }) })).json()
    if (t !== true) return reply(200, GENERIC)
    const ok = await (await fetch(`${SB_URL}/rest/v1/rpc/vendor_login_allowed`, { method: 'POST', headers: h, body: JSON.stringify({ p_email: email }) })).json()
    if (ok !== true) return reply(200, GENERIC)

    // 3. One-time sign-in link from the admin API (the user already exists, so nothing is created).
    const gl = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, { method: 'POST', headers: h, body: JSON.stringify({ type: 'magiclink', email, redirect_to: PORTAL }) })
    if (!gl.ok) { console.error('generate_link failed', gl.status, await gl.text()); return reply(200, GENERIC) }
    const link = (await gl.json())?.action_link as string
    if (!isSafeLink(link, SB_URL)) { console.error('unexpected link host'); return reply(200, GENERIC) }

    // 4. Send it.
    const m = signinEmail(link, email)
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject: m.subject, html: m.html, text: m.text, reply_to: 'support@unionvault.app' }),
    })
    if (!r.ok) console.error('Resend error', r.status, await r.text())
    else console.log('vendor sign-in email sent')
  } catch (e) { console.error('vendor-signin error', e) }
  return reply(200, GENERIC)
})
