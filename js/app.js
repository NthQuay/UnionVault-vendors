// Union Vault Vendors portal. Plain JavaScript, no build step. All data comes from the shared Supabase project
// through functions/policies defined in the main repo (supabase/migrations/20261110…, 20261111…, 20261112…).
(function () {
  'use strict';
  const C = window.PORTAL_CONFIG, app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = c => '$' + (Number(c || 0) / 100).toFixed(2);
  const fmtDay = iso => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const fmtWhen = iso => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const LINKS = { website: 'Website', contact: 'Contact form', instagram: 'Instagram', book: 'Book online', call: 'Calls', email: 'Emails' };
  const demoKind = new URLSearchParams(location.search).get('demo');

  // ── data access (real = supabase-js; demo = fixtures) ──
  let api;
  if (demoKind && window.PORTAL_DEMO) api = window.PORTAL_DEMO(demoKind);
  else {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    api = {
      session: async () => (await sb.auth.getSession()).data.session,
      signIn: async email => { const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/', shouldCreateUser: false } }); if (error) throw error; },
      signOut: async () => { await sb.auth.signOut(); location.reload(); },
      rpc: async (name, args) => { const { data, error } = await sb.rpc(name, args || {}); if (error) throw error; return data; },
      select: async (table, o) => {
        let q = sb.from(table).select('*');
        if (o && o.eq) Object.entries(o.eq).forEach(([k, v]) => { q = q.eq(k, v); });
        if (o && o.order) q = q.order(o.order, { ascending: false });
        if (o && o.limit) q = q.limit(o.limit);
        const { data, error } = await q; if (error) throw error; return data;
      }
    };
  }

  const S = { user: null, role: null, tab: null, msg: null };
  const shell = (tabs, body) => `${api.demo ? '<div class="demo">Sample data for design review</div>' : ''}
    <div class="top"><div class="brand">UnionVault<span class="pill">Vendors</span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab${S.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="who">${esc(S.user && S.user.email)} &nbsp;·&nbsp; <a href="#" data-act="signout">Sign out</a></div></div>
    <div class="wrap">${S.msg ? `<div class="note ${S.msg.kind || ''}">${esc(S.msg.text)}</div>` : ''}${body}</div>`;
  const stat = (l, n, s) => `<div class="stat"><div class="l">${l}</div><div class="n">${n}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const bars = vals => { const m = Math.max(1, ...vals); return `<svg class="bars" viewBox="0 0 ${vals.length * 10} 70" preserveAspectRatio="none" role="img" aria-label="Clicks per day">${vals.map((v, i) => `<rect x="${i * 10 + 1}" y="${70 - (v / m) * 64}" width="7" height="${(v / m) * 64}" rx="1.5" fill="var(--gold-deep)" opacity="${i === vals.length - 1 ? 1 : .55}"/>`).join('')}</svg>`; };

  // ── login ──
  function loginView(sent) {
    app.innerHTML = `<div class="login"><div class="brand" style="font-size:26px">UnionVault<span class="pill">Vendors</span></div>
      <h1 style="margin-top:28px">Sign in</h1><p>Enter the email address we have for you. We’ll send a one-tap sign-in link.</p>
      ${S.msg ? `<div class="note ${S.msg.kind || ''}">${esc(S.msg.text)}</div>` : ''}
      ${sent ? '<div class="note ok">Check your inbox for the sign-in link.</div>' : `<form id="loginform"><div class="field"><input type="email" id="email" placeholder="you@business.com" autocomplete="email" required></div><button class="btn primary" style="width:100%">Email me a sign-in link</button></form>`}
      <p style="font-size:12px;margin-top:22px">Access is by invitation. If you haven’t been invited, contact <a href="mailto:support@unionvault.app">support@unionvault.app</a>.</p></div>`;
  }

  // ── vendor ──
  async function vendorDashboard() {
    const [clicks, recent, sum, refs] = await Promise.all([api.rpc('vendor_click_summary', { p_days: C.clickDays }), api.rpc('vendor_recent_clicks', { p_limit: 15 }), api.rpc('partner_summary'), api.rpc('partner_referrals')]);
    const by = {}; const perDay = {};
    (clicks || []).forEach(r => { by[r.link] = (by[r.link] || 0) + Number(r.clicks); perDay[r.day] = (perDay[r.day] || 0) + Number(r.clicks); });
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    const days = Object.keys(perDay).sort().map(d => perDay[d]);
    const pct = n => total ? Math.round((n / total) * 100) + '%' : '';
    const link = `${C.appUrl}/?ref=${encodeURIComponent(sum.code)}`;
    const status = { active: 'Paying', trialing: 'Free trial', none: 'Signed up', past_due: 'Payment issue', canceled: 'Cancelled' };
    return `<div class="head"><div><h1>${esc(sum.name)}</h1><div class="sub">Last ${C.clickDays} days</div></div>
      <div class="linkbox"><span style="color:var(--muted)">Your referral link</span><br><b id="reflink">${esc(link)}</b> · <a href="#" data-act="copy" data-text="${esc(link)}">Copy</a></div></div>
      <div class="eyebrow">Clicks from Union Vault to you</div>
      <div class="grid">${stat('Total clicks', total, '')}${stat('Website', by.website || 0, pct(by.website || 0))}${stat('Contact form', by.contact || 0, pct(by.contact || 0))}${stat('Calls / emails', (by.call || 0) + (by.email || 0), pct((by.call || 0) + (by.email || 0)))}</div>
      <div class="card" style="margin-top:12px"><div class="sub" style="margin-bottom:6px">Clicks per day</div>${days.length ? bars(days) : '<div class="sub">No clicks yet.</div>'}</div>
      <div class="eyebrow">People you sent to Union Vault (your referral link)</div>
      <div class="grid">${stat('Sign-ups', sum.signups, '')}${stat('Paying subscribers', sum.active_subscribers, 'active now')}${stat('Commission earned', money(sum.earned_cents), Math.round(sum.rate * 100) + '% · paid quarterly')}${stat('Awaiting payout', money(sum.unpaid_cents), '')}</div>
      <div class="eyebrow">Recent clicks</div>
      <div class="tablewrap"><table><tr><th>When</th><th>Button</th><th>Visitor</th></tr>${(recent || []).map(r => `<tr><td>${fmtWhen(r.clicked_at)}</td><td>${esc(LINKS[r.link] || r.link)}</td><td class="mono">${esc(r.visitor_id)}</td></tr>`).join('') || '<tr><td colspan="3" class="sub">No clicks yet.</td></tr>'}</table></div>
      <div class="eyebrow">Referred sign-ups</div>
      <div class="tablewrap"><table><tr><th>Referred user</th><th>Signed up</th><th>Status</th></tr>${(refs || []).map(r => `<tr><td class="mono">${esc(r.anon_id)}</td><td>${fmtDay(r.signed_up_at)}</td><td>${esc(status[r.subscription_status] || r.subscription_status)}</td></tr>`).join('') || '<tr><td colspan="3" class="sub">No sign-ups yet.</td></tr>'}</table></div>
      <div class="sub" style="margin-top:8px">Visitors and referred users are shown by an anonymous ID only. IDs are different for each vendor.</div>`;
  }

  const FIELDS = [['name', 'Business name'], ['category_label', 'Category'], ['phone', 'Phone'], ['email', 'Email'], ['area', 'Service area'], ['hours', 'Opening hours'], ['website_url', 'Website link'], ['contact_url', 'Contact form link'], ['instagram_url', 'Instagram link']];
  async function vendorProfile() {
    const vid = await api.rpc('my_vendor_id');
    if (!vid) return '<div class="note">Your account isn’t linked to a listing yet.</div>';
    const [rows, ch] = await Promise.all([api.select('vendor_profiles', { eq: { vendor_id: vid } }), api.select('vendor_profile_changes', { eq: { vendor_id: vid }, order: 'submitted_at', limit: 1 })]);
    const p = rows[0] || {}, last = ch && ch[0];
    const inp = (k, l) => `<div class="field"><label for="f-${k}">${l}</label>${k === 'area' || k === 'hours' ? `<textarea rows="2" id="f-${k}" data-k="${k}">${esc(p[k])}</textarea>` : `<input id="f-${k}" data-k="${k}" value="${esc(p[k])}" ${k.endsWith('_url') ? 'placeholder="https://… (leave blank to keep the current link)"' : ''}>`}</div>`;
    return `<div class="cols"><div class="main"><div class="head"><h1>Edit your listing</h1></div>
      <div class="note">Changes are reviewed by Union Vault before they appear (usually within a day). The Google rating and our note about you are added by Union Vault.</div>
      ${last && last.status === 'pending' ? '<div class="note">You have a change waiting for review. Submitting again replaces it.</div>' : ''}
      ${last && last.status === 'rejected' ? `<div class="note err">Your last change wasn’t approved${last.review_note ? ': ' + esc(last.review_note) : ''}.</div>` : ''}
      <form id="profileform">${FIELDS.map(([k, l]) => inp(k, l)).join('')}<button class="btn primary">Submit for review</button></form></div>
      <div class="side"><div class="eyebrow" style="margin-top:0">How couples see it</div><div class="card" id="preview">${preview(p)}</div></div></div>`;
  }
  function preview(p) { return `<div style="font-family:'Cormorant Garamond',serif;font-size:22px">${esc(p.name)}</div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:8px">${esc(p.category_label)}</div><div style="margin-bottom:4px"><span style="color:var(--muted)">Services:</span> ${esc(p.area)}</div><div class="sub">${esc([p.hours, p.phone].filter(Boolean).join(' · '))}</div>`; }

  async function vendorTerms() {
    const [terms, acc] = await Promise.all([api.select('partner_terms', { order: 'effective_from', limit: 1 }), api.select('partner_terms_acceptances')]);
    const t = terms && terms[0]; if (!t) return '<div class="head"><h1>Terms</h1></div><div class="note">No terms have been published yet.</div>';
    const done = (acc || []).some(a => a.terms_id === t.id);
    return `<div class="head"><div><h1>${esc(t.title)}</h1><div class="sub">Version ${esc(t.version)}</div></div></div><div class="terms">${esc(t.body_md)}</div>
      ${done ? '<div class="note ok" style="margin-top:14px">You have accepted these terms.</div>' : `<div style="margin-top:14px"><button class="btn primary" data-act="accept" data-id="${esc(t.id)}">I accept these terms</button></div>`}`;
  }

  // ── admin ──
  async function adminOverview() {
    const [ov, ch, rc] = await Promise.all([api.rpc('admin_partner_overview', { p_days: C.clickDays }), api.select('vendor_profile_changes', { eq: { status: 'pending' } }), api.rpc('admin_recent_clicks', { p_limit: 40 })]);
    const sum = k => (ov || []).reduce((a, r) => a + Number(r[k] || 0), 0);
    return `<div class="head"><div><h1>All vendors</h1><div class="sub">Last ${C.clickDays} days</div></div></div>
      <div class="grid">${stat('Clicks to vendors', sum('clicks'), '')}${stat('Referred sign-ups', sum('signups'), '')}${stat('Paying referred', sum('paying'), '')}${stat('Commission earned', money(sum('commission_cents')), 'all time')}</div>
      <div class="eyebrow">Vendors</div>
      <div class="tablewrap"><table><tr><th>Vendor</th><th>Clicks</th><th>Contact form</th><th>Calls / emails</th><th>Sign-ups</th><th>Paying</th><th>Commission</th></tr>${(ov || []).map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${r.clicks}</td><td>${r.contact_form}</td><td>${r.calls_emails}</td><td>${r.signups}</td><td>${r.paying}</td><td>${money(r.commission_cents)}</td></tr>`).join('') || '<tr><td colspan="7" class="sub">No partners yet.</td></tr>'}</table></div>
      <div class="eyebrow">Profile changes to review (${(ch || []).length})</div>
      ${(ch || []).map(c => `<div class="card"><b>${esc(c.vendor_id)}</b> <span class="sub">· ${fmtWhen(c.submitted_at)}</span><div class="mono" style="font-size:12px;margin:8px 0">${Object.entries(c.proposed || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>
        <button class="btn primary" data-act="review" data-id="${esc(c.id)}" data-ok="1">Approve</button> <button class="btn" data-act="review" data-id="${esc(c.id)}" data-ok="0">Reject</button></div>`).join('') || '<div class="sub">Nothing waiting.</div>'}
      <div class="eyebrow">Recent clicks (who)</div>
      <div class="tablewrap"><table><tr><th>When</th><th>Vendor</th><th>Button</th><th>Signed-in user</th></tr>${(rc || []).filter(r => !r.is_bot).map(r => `<tr><td>${fmtWhen(r.clicked_at)}</td><td>${esc(r.vendor_id)}</td><td>${esc(LINKS[r.link] || r.link)}</td><td>${esc(r.user_email || 'guest')}</td></tr>`).join('')}</table></div>`;
  }

  // ── routing ──
  async function render() {
    try {
      let tabs, body;
      if (S.role === 'admin') { tabs = [['overview', 'Overview']]; S.tab = 'overview'; body = await adminOverview(); }
      else if (S.role === 'vendor') {
        tabs = [['dashboard', 'Dashboard'], ['profile', 'My profile'], ['terms', 'Terms']]; if (!S.tab) S.tab = 'dashboard';
        body = S.tab === 'profile' ? await vendorProfile() : S.tab === 'terms' ? await vendorTerms() : await vendorDashboard();
      } else { tabs = []; body = '<div class="note">Your account isn’t linked to a vendor listing yet. Please contact <a href="mailto:support@unionvault.app">support@unionvault.app</a>.</div>'; }
      app.innerHTML = shell(tabs, body);
    } catch (e) { console.error(e); app.innerHTML = shell([], `<div class="note err">Something went wrong loading this page. ${esc(e.message || e)}</div>`); }
    S.msg = null;
  }

  app.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'loginform') {
      const email = document.getElementById('email').value.trim();
      try { await api.signIn(email); loginView(true); } catch (err) { S.msg = { kind: 'err', text: 'Could not send the link. Check the address, or ask us to invite you.' }; loginView(false); }
    }
    if (e.target.id === 'profileform') {
      const vid = await api.rpc('my_vendor_id'); const rows = await api.select('vendor_profiles', { eq: { vendor_id: vid } }); const p = rows[0] || {};
      const diff = {}; e.target.querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k, v = i.value.trim(); if (k.endsWith('_url') ? v !== '' : v !== String(p[k] == null ? '' : p[k])) diff[k] = v; });
      try { const r = await api.rpc('submit_profile_change', { p: diff }); S.msg = r && r.ok ? { kind: 'ok', text: 'Submitted. We’ll review it shortly.' } : { kind: 'err', text: r && r.error === 'nothing_to_change' ? 'You haven’t changed anything.' : 'That change couldn’t be submitted (' + esc(r && r.error) + ').' }; }
      catch (err) { S.msg = { kind: 'err', text: 'Could not submit: ' + (err.message || err) }; }
      render();
    }
  });
  app.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return; const act = el.dataset.act;
    if (act === 'signout') { e.preventDefault(); api.signOut(); }
    if (act === 'tab') { S.tab = el.dataset.tab; render(); }
    if (act === 'copy') { e.preventDefault(); try { await navigator.clipboard.writeText(el.dataset.text); el.textContent = 'Copied'; } catch (_) {} }
    if (act === 'accept') { try { await api.rpc('accept_terms', { p_terms: el.dataset.id }); S.msg = { kind: 'ok', text: 'Thank you — terms accepted.' }; } catch (err) { S.msg = { kind: 'err', text: 'Could not record acceptance: ' + (err.message || err) }; } render(); }
    if (act === 'review') { try { await api.rpc('review_profile_change', { p_id: el.dataset.id, p_approve: el.dataset.ok === '1' }); S.msg = { kind: 'ok', text: el.dataset.ok === '1' ? 'Approved.' : 'Rejected.' }; } catch (err) { S.msg = { kind: 'err', text: err.message || String(err) }; } render(); }
  });
  app.addEventListener('input', e => {   // live preview in the profile editor
    if (!e.target.dataset || !e.target.dataset.k) return;
    const pv = document.getElementById('preview'); if (!pv) return;
    const g = k => { const i = app.querySelector(`[data-k="${k}"]`); return i ? i.value : ''; };
    pv.innerHTML = preview({ name: g('name'), category_label: g('category_label'), area: g('area'), hours: g('hours'), phone: g('phone') });
  });

  (async function boot() {
    try {
      const ses = await api.session();
      if (!ses) { loginView(false); return; }
      S.user = ses.user;
      const sum = await api.rpc('partner_summary');
      if (sum) S.role = 'vendor'; else S.role = (await api.rpc('is_admin')) ? 'admin' : 'none';
      render();
    } catch (e) { console.error(e); loginView(false); }
  })();
})();
