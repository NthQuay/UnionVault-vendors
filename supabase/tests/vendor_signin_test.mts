// Run:  node --experimental-strip-types supabase/tests/vendor_signin_test.mts
import { signinEmail, isEmail, isSafeLink, SUBJECT, FROM } from '../functions/vendor-signin/email.ts'
import assert from 'node:assert/strict'
const link = 'https://hzafdlfprtzfxtyaebmc.supabase.co/auth/v1/verify?token=abc&type=magiclink&redirect_to=https://vendors.unionvault.app/'
const m = signinEmail(link, 'ben@storylineceremonies.com.au')
assert.equal(m.subject, SUBJECT); assert.ok(FROM.startsWith('Union Vault Vendors <'))
assert.ok(m.html.includes('href="' + link.replace(/&/g, '&amp;') + '"'), 'button link is attribute-escaped')
assert.ok(m.html.includes('ben@storylineceremonies.com.au') && m.html.includes('Sign in to Union Vault Vendors') && m.html.includes('email-logo-black.png') && m.html.includes('email-logo-white.png'))
assert.ok(!m.html.includes('{{') && !m.html.includes('${'), 'no unfilled placeholders')
assert.ok(m.text.includes(link))
// hostile input cannot break out of the HTML
const bad = signinEmail('https://x.example/"><script>alert(1)</script>', 'a"><img src=x onerror=1>@b.co')
assert.ok(!bad.html.includes('<script>alert') && !bad.html.includes('<img src=x'))
// validation
assert.ok(isEmail('ben@storylineceremonies.com.au')); assert.ok(!isEmail('nope')); assert.ok(!isEmail('a b@c.co')); assert.ok(!isEmail('<a@b.co>')); assert.ok(!isEmail('a'.repeat(200) + '@b.co')); assert.ok(!isEmail(null))
// the link must be ours
const sb = 'https://hzafdlfprtzfxtyaebmc.supabase.co'
assert.ok(isSafeLink(link, sb)); assert.ok(!isSafeLink('https://evil.example/auth/v1/verify?x=1', sb)); assert.ok(!isSafeLink('http://hzafdlfprtzfxtyaebmc.supabase.co/auth/v1/verify', sb)); assert.ok(!isSafeLink(sb + '/rest/v1/x', sb)); assert.ok(!isSafeLink('javascript:alert(1)', sb))
console.log('vendor-signin helpers: all tests passed')
