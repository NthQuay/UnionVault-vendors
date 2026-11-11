// Admin approves or denies a vendor request. Needs the admin's signed-in session (Authorization header); the function
// re-checks that the caller is in app_admins. Deploy with verify_jwt = true.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { reviewRequest } from '../_shared/vendor-review.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization' }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false })
  const sbUrl = Deno.env.get('SUPABASE_URL') ?? '', sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!sbUrl || !sbKey || !resendKey) return reply(503, { ok: false, error: 'Not configured' })
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return reply(400, { ok: false, error: 'bad_json' }) }
  try {
    const out = await reviewRequest({ fetch, sbUrl, sbKey, resendKey }, req.headers.get('authorization') ?? '', body)
    return reply(out.status, out.body)
  } catch (e) { console.error('vendor-request-review error', e); return reply(500, { ok: false, error: 'server_error' }) }
})
