// The vendor sign-in email (branded, dark-mode aware). Kept free of Deno imports so it can be unit-tested with Node.
// Design preview: see the portal repo history (email-templates/). Logo files are served from https://unionvault.app/assets/.

export const SUBJECT = 'Your Union Vault Vendors sign-in link'
export const FROM = 'Union Vault Vendors <vendors@unionvault.app>'

const escH = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 120 && /^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(v)
}

/** Only ever link to our own Supabase auth endpoint (defence in depth: the link comes from the admin API, never from the client). */
export function isSafeLink(url: string, supabaseUrl: string): boolean {
  try { const u = new URL(url); const s = new URL(supabaseUrl); return u.protocol === 'https:' && u.host === s.host && u.pathname.startsWith('/auth/v1/verify') } catch { return false }
}

export function signinEmail(url: string, email: string): { subject: string; html: string; text: string } {
  const u = escH(url), e = escH(email)
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Sign in to Union Vault Vendors</title>
<style>
  @media (prefers-color-scheme: dark){
    .uv-bg{background:#111114!important}.uv-card{background:#1A1A1F!important;border-color:#34343B!important}
    .uv-ink{color:#EDE6DA!important}.uv-muted{color:#A79E92!important}.uv-rule{border-color:#34343B!important}
    .uv-pill{color:#D8BE86!important;border-color:#8B7447!important}.uv-note{background:#222228!important;border-color:#34343B!important}
  }
  @media (max-width:480px){.uv-pad{padding-left:22px!important;padding-right:22px!important}}
</style></head>
<body class="uv-bg" style="margin:0;padding:0;background:#F4EFE7;-webkit-text-size-adjust:100%">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">Your one-tap sign-in link for the Union Vault vendor portal.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="uv-bg" style="background:#F4EFE7"><tr><td align="center" style="padding:32px 14px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="uv-card" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E8DFCF;border-radius:18px">
    <tr><td align="center" class="uv-pad" style="padding:34px 40px 6px">
      <a href="https://vendors.unionvault.app" style="text-decoration:none">
        <picture><source srcset="https://unionvault.app/assets/email-logo-white.png" media="(prefers-color-scheme: dark)"><img src="https://unionvault.app/assets/email-logo-black.png" width="84" alt="Union Vault" style="display:block;width:84px;height:auto;border:0;margin:0 auto"></picture>
      </a>
      <div class="uv-pill" style="display:inline-block;margin-top:10px;font:600 10px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8B6E3A;border:1px solid #C4A67A;border-radius:10px;padding:3px 10px">Vendors</div>
    </td></tr>
    <tr><td align="center" class="uv-pad" style="padding:20px 40px 0">
      <h1 class="uv-ink" style="margin:0;font:600 28px Georgia,'Times New Roman',serif;color:#2C2A27">Sign in to your vendor account</h1>
      <p class="uv-muted" style="margin:12px 0 0;font:15px/1.6 Helvetica,Arial,sans-serif;color:#6E6259">Tap the button below to open your Union Vault vendor portal. No password needed.</p>
    </td></tr>
    <tr><td align="center" class="uv-pad" style="padding:26px 40px 8px">
      <a href="${u}" style="display:inline-block;background:#B8975A;color:#FFFFFF;text-decoration:none;font:600 15px Helvetica,Arial,sans-serif;padding:14px 34px;border-radius:12px">Sign in to Union Vault Vendors</a>
    </td></tr>
    <tr><td align="center" class="uv-pad" style="padding:6px 40px 4px">
      <p class="uv-muted" style="margin:10px 0 0;font:12.5px/1.6 Helvetica,Arial,sans-serif;color:#8E8576">This link works once and expires soon. If you didn’t ask to sign in, you can ignore this email.</p>
    </td></tr>
    <tr><td class="uv-pad" style="padding:20px 40px 6px">
      <div class="uv-note" style="background:#F6F2EA;border:1px solid #E8DFCF;border-radius:12px;padding:12px 14px">
        <p class="uv-muted" style="margin:0;font:12px/1.6 Helvetica,Arial,sans-serif;color:#6E6259">Button not working? Copy and paste this address into your browser:<br><a href="${u}" style="color:#8B6E3A;word-break:break-all">${u}</a></p>
      </div>
    </td></tr>
    <tr><td class="uv-pad" style="padding:18px 40px 0"><hr class="uv-rule" style="border:none;border-top:1px solid #E8DFCF;margin:0"></td></tr>
    <tr><td align="center" class="uv-pad" style="padding:16px 40px 28px">
      <p class="uv-muted" style="margin:0;font:12px/1.7 Helvetica,Arial,sans-serif;color:#8E8576">Sent to ${e} because a Union Vault vendor account exists for this address.<br>Need help? <a href="mailto:support@unionvault.app" style="color:#8B6E3A">support@unionvault.app</a></p>
    </td></tr>
  </table>
  <p class="uv-muted" style="margin:16px 0 0;font:11px Helvetica,Arial,sans-serif;color:#8E8576">© 2026 NthQuay Pty Ltd trading as Union Vault</p>
</td></tr></table>
</body></html>
`
  const text = `Sign in to your Union Vault vendor account\n\nOpen this link to sign in (it works once and expires soon):\n${url}\n\nIf you didn't ask to sign in, you can ignore this email.\n\nSent to ${email} because a Union Vault vendor account exists for this address.\nNeed help? support@unionvault.app\n\n© 2026 NthQuay Pty Ltd trading as Union Vault`
  return { subject: SUBJECT, html, text }
}

// ── other vendor emails (same look as the sign-in email) ─────────────────────────────────────────────────────────────
function shell(title: string, preheader: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escH(title)}</title>
<style>
  @media (prefers-color-scheme: dark){
    .uv-bg{background:#111114!important}.uv-card{background:#1A1A1F!important;border-color:#34343B!important}
    .uv-ink{color:#EDE6DA!important}.uv-muted{color:#A79E92!important}.uv-rule{border-color:#34343B!important}
    .uv-pill{color:#D8BE86!important;border-color:#8B7447!important}.uv-note{background:#222228!important;border-color:#34343B!important}
  }
  @media (max-width:480px){.uv-pad{padding-left:22px!important;padding-right:22px!important}}
</style></head>
<body class="uv-bg" style="margin:0;padding:0;background:#F4EFE7;-webkit-text-size-adjust:100%">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escH(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="uv-bg" style="background:#F4EFE7"><tr><td align="center" style="padding:32px 14px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="uv-card" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E8DFCF;border-radius:18px">
    <tr><td align="center" class="uv-pad" style="padding:34px 40px 6px">
      <a href="https://vendors.unionvault.app" style="text-decoration:none"><picture><source srcset="https://unionvault.app/assets/email-logo-white.png" media="(prefers-color-scheme: dark)"><img src="https://unionvault.app/assets/email-logo-black.png" width="84" alt="Union Vault" style="display:block;width:84px;height:auto;border:0;margin:0 auto"></picture></a>
      <div class="uv-pill" style="display:inline-block;margin-top:10px;font:600 10px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8B6E3A;border:1px solid #C4A67A;border-radius:10px;padding:3px 10px">Vendors</div>
    </td></tr>
    ${inner}
    <tr><td class="uv-pad" style="padding:18px 40px 0"><hr class="uv-rule" style="border:none;border-top:1px solid #E8DFCF;margin:0"></td></tr>
    <tr><td align="center" class="uv-pad" style="padding:16px 40px 28px"><p class="uv-muted" style="margin:0;font:12px/1.7 Helvetica,Arial,sans-serif;color:#8E8576">Need help? <a href="mailto:support@unionvault.app" style="color:#8B6E3A">support@unionvault.app</a></p></td></tr>
  </table>
  <p class="uv-muted" style="margin:16px 0 0;font:11px Helvetica,Arial,sans-serif;color:#8E8576">\u00a9 2026 NthQuay Pty Ltd trading as Union Vault</p>
</td></tr></table></body></html>`
}
const h1 = (t: string) => `<tr><td align="center" class="uv-pad" style="padding:20px 40px 0"><h1 class="uv-ink" style="margin:0;font:600 28px Georgia,'Times New Roman',serif;color:#2C2A27">${escH(t)}</h1></td></tr>`
const para = (t: string) => `<tr><td class="uv-pad" style="padding:12px 40px 0"><p class="uv-muted" style="margin:0;font:15px/1.6 Helvetica,Arial,sans-serif;color:#6E6259">${t}</p></td></tr>`
const noteBox = (note: string) => note ? `<tr><td class="uv-pad" style="padding:16px 40px 0"><div class="uv-note" style="background:#F6F2EA;border:1px solid #E8DFCF;border-radius:12px;padding:12px 14px"><p class="uv-muted" style="margin:0;font:13px/1.6 Helvetica,Arial,sans-serif;color:#6E6259"><b>A note from us:</b><br>${escH(note).replace(/\n/g, '<br>')}</p></div></td></tr>` : ''
const btn = (href: string, label: string) => `<tr><td align="center" class="uv-pad" style="padding:24px 40px 6px"><a href="${escH(href)}" style="display:inline-block;background:#B8975A;color:#FFFFFF;text-decoration:none;font:600 15px Helvetica,Arial,sans-serif;padding:14px 34px;border-radius:12px">${escH(label)}</a></td></tr>`

export function approvalEmail(o: { name: string; business: string; url: string; note: string; wantListing: boolean; wantAffiliate: boolean; code: string }) {
  const first = escH((o.name || '').split(' ')[0] || 'there')
  const items: string[] = []
  if (o.wantListing) items.push('your vendor listing, which stays private until we publish it (you can add your details, photos and prices first)')
  if (o.wantAffiliate) items.push(`your referral link: <a href="https://unionvault.app/?ref=${escH(o.code)}" style="color:#8B6E3A">https://unionvault.app/?ref=${escH(o.code)}</a>. We’ll confirm the commission terms with you separately`)
  const html = shell('You’re approved', 'Your Union Vault vendor account is ready.',
    h1('You’re approved') + para(`Hi ${first}, thanks for your request. <b>${escH(o.business)}</b> now has a Union Vault vendor account.`) +
    para(`Your account includes ${items.length === 1 ? items[0] : items.slice(0, -1).join('; ') + '; and ' + items[items.length - 1]}.`) + noteBox(o.note) +
    btn(o.url, 'Sign in to Union Vault Vendors') +
    `<tr><td align="center" class="uv-pad" style="padding:6px 40px 4px"><p class="uv-muted" style="margin:10px 0 0;font:12.5px/1.6 Helvetica,Arial,sans-serif;color:#8E8576">This link works once and expires soon. Next time, just enter your email at vendors.unionvault.app and we’ll send a new one.</p></td></tr>`)
  const text = `You're approved\n\nHi ${(o.name || '').split(' ')[0] || 'there'}, ${o.business} now has a Union Vault vendor account.\n${o.wantListing ? '- Your vendor listing stays private until we publish it.\n' : ''}${o.wantAffiliate ? `- Your referral link: https://unionvault.app/?ref=${o.code} (commission terms to be confirmed separately).\n` : ''}${o.note ? `\nA note from us: ${o.note}\n` : ''}\nSign in (works once, expires soon):\n${o.url}\n\nNext time, enter your email at https://vendors.unionvault.app and we'll send a new link.\nNeed help? support@unionvault.app`
  return { subject: 'You’re approved: welcome to Union Vault Vendors', html, text }
}

export function denialEmail(o: { name: string; business: string; note: string }) {
  const first = escH((o.name || '').split(' ')[0] || 'there')
  const html = shell('About your request', 'An update on your Union Vault vendor request.',
    h1('About your request') + para(`Hi ${first}, thank you for your interest in listing <b>${escH(o.business)}</b> with Union Vault. We’re not able to take it further right now.`) + noteBox(o.note) +
    para('If your business or plans change, you’re welcome to request access again at any time.'))
  const text = `About your request\n\nHi ${(o.name || '').split(' ')[0] || 'there'}, thank you for your interest in listing ${o.business} with Union Vault. We're not able to take it further right now.\n${o.note ? `\nA note from us: ${o.note}\n` : ''}\nIf your business or plans change, you're welcome to request access again at any time.\nNeed help? support@unionvault.app`
  return { subject: 'About your Union Vault vendor request', html, text }
}

export function adminAlertEmail(o: { name: string; business: string; email: string; phone: string; website: string; about: string; wantListing: boolean; wantAffiliate: boolean }) {
  const wants = [o.wantListing ? 'appear as a vendor' : '', o.wantAffiliate ? 'an affiliate link' : ''].filter(Boolean).join(' + ')
  const row = (k: string, v: string) => `<tr><td class="uv-muted" style="padding:4px 12px 4px 0;font:13px Helvetica,Arial,sans-serif;color:#8E8576;vertical-align:top">${k}</td><td class="uv-ink" style="padding:4px 0;font:14px/1.5 Helvetica,Arial,sans-serif;color:#2C2A27">${v}</td></tr>`
  const html = shell('New vendor request', `${o.business} has asked for vendor access.`,
    h1('New vendor request') + `<tr><td class="uv-pad" style="padding:14px 40px 0"><table role="presentation" cellpadding="0" cellspacing="0">${row('Business', '<b>' + escH(o.business) + '</b>')}${row('Name', escH(o.name))}${row('Email', escH(o.email))}${row('Phone', escH(o.phone))}${row('Website', escH(o.website || '—'))}${row('Wants', escH(wants))}${row('About', escH(o.about).replace(/\n/g, '<br>'))}</table></td></tr>` +
    btn('https://vendors.unionvault.app', 'Review in the portal'))
  const text = `New vendor request\n\nBusiness: ${o.business}\nName: ${o.name}\nEmail: ${o.email}\nPhone: ${o.phone}\nWebsite: ${o.website || '-'}\nWants: ${wants}\nAbout: ${o.about}\n\nReview: https://vendors.unionvault.app`
  return { subject: `New vendor request: ${o.business}`, html, text }
}
