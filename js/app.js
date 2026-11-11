// Union Vault Vendors portal. Plain JavaScript, no build step. All data comes from the shared Supabase project
// through functions/policies defined in supabase/migrations/ in this repo (plus 20261110/20261111 in the main repo).
(function () {
  'use strict';
  const C = window.PORTAL_CONFIG, app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pctText = r => (r == null ? null : Math.round(Number(r) * 100) + '%');
  // "Month-to-month · $12.99/mo", "3-month · $10.39/mo" … (monthly equivalent of what the client pays per billing period)
  const planText = (months, cents) => {
    if (!months) return '<span class="sub">—</span>';
    const per = cents == null ? '' : ' · ' + '$' + (Number(cents) / months / 100).toFixed(2) + '/mo';
    return (months === 1 ? 'Month-to-month' : months + '-month') + per;
  };
  const money = c => (Number(c) < 0 ? '-' : '') + '$' + (Math.abs(Number(c || 0)) / 100).toFixed(2);
  const fmtDay = iso => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const fmtWhen = iso => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const LINKS = { website: 'Website', contact: 'Contact form', instagram: 'Instagram', book: 'Book online', call: 'Call', email: 'Email' };
  const LCOL = { website: 'var(--c-web)', contact: 'var(--c-contact)', call: 'var(--c-call)', email: 'var(--c-email)', instagram: 'var(--c-ig)', book: 'var(--gold)' };
  const qs = new URLSearchParams(location.search);
  const demoKind = qs.get('demo');
  if (qs.get('theme') === 'dark' || qs.get('theme') === 'light') document.documentElement.dataset.theme = qs.get('theme');

  // ── data access (real = supabase-js; demo = fixtures) ──
  let api;
  if (demoKind && window.PORTAL_DEMO) api = window.PORTAL_DEMO(demoKind);
  else {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    api = {
      session: async () => (await sb.auth.getSession()).data.session,
      // Our own branded sign-in email (vendor-signin function, sent from "Union Vault Vendors"). If that is unreachable,
      // fall back to Supabase's built-in magic link so nobody is ever locked out.
      signIn: async email => {
        try { const r = await fetch(C.supabaseUrl + '/functions/v1/vendor-signin', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: C.supabaseKey }, body: JSON.stringify({ email }) }); if (r.ok) return; } catch (_) { /* fall through */ }
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/', shouldCreateUser: false } }); if (error) throw error;
      },
      signOut: async () => { await sb.auth.signOut(); location.reload(); },
      rpc: async (name, args) => { const { data, error } = await sb.rpc(name, args || {}); if (error) throw error; return data; },
      select: async (table, o) => {
        let q = sb.from(table).select('*');
        if (o && o.eq) Object.entries(o.eq).forEach(([k, v]) => { q = q.eq(k, v); });
        if (o && o.order) q = q.order(o.order, { ascending: false });
        if (o && o.limit) q = q.limit(o.limit);
        const { data, error } = await q; if (error) throw error; return data;
      },
      upload: async (path, blob) => { const { error } = await sb.storage.from('vendor-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false }); if (error) throw error; return path; }
    };
  }
  // A stored photo is a storage path (real) or a blob:/data: URL (demo, or just picked this session).
  const photoUrl = p => !p ? '' : /^(blob:|data:)/.test(p) ? p.replace(/'/g, '%27').replace(/"/g, '%22') : `${C.supabaseUrl}/storage/v1/object/public/vendor-media/${p}`;

  const S = { user: null, role: null, tab: null, msg: null, stmt: null, range: '30', draft: null, orig: null, vendorId: null, uploading: false };
  const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'UV';
  const shell = (tabs, body) => `${api.demo ? '<div class="demo">Sample data for design review</div>' : ''}
    <div class="top"><div class="brand">UnionVault<span class="pill">Vendors</span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab${S.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="who">${esc(S.user && S.user.email)}<span class="av">${esc(S.avatar || '')}</span><a href="#" data-act="signout">Sign out</a></div></div>
    <div class="wrap">${S.msg ? `<div class="note ${S.msg.kind || ''}">${esc(S.msg.text)}</div>` : ''}${body}</div>`;
  const stat = (icon, l, n, s, col) => `<div class="stat"${col ? ` style="--c:${col}"` : ''}><div class="ic">${icon}</div><div class="l">${l}</div><div class="n">${n}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

  // ── login ──
  function loginView(sent) {
    app.innerHTML = `<div class="login"><div class="brand" style="font-size:26px">UnionVault<span class="pill">Vendors</span></div>
      <h1 style="margin-top:28px">Sign in</h1><p>Enter the email address we have for you. We’ll send a one-tap sign-in link.</p>
      ${S.msg ? `<div class="note ${S.msg.kind || ''}">${esc(S.msg.text)}</div>` : ''}
      ${sent ? '<div class="note ok">If that address has a vendor account, a sign-in link is on its way. It can take a minute, and it’s worth checking your spam folder.</div>' : `<form id="loginform"><div class="field"><input type="email" id="email" placeholder="you@business.com" autocomplete="email" required></div><button class="btn primary" style="width:100%;margin-top:8px">Email me a sign-in link</button></form>`}
      <p style="font-size:12px;margin-top:22px">Access is by invitation. If you haven’t been invited, contact <a href="mailto:support@unionvault.app">support@unionvault.app</a>.</p></div>`;
  }

  // ── dates & ranges ──
  const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayDiff = (a, b) => Math.round((b - a) / 86400000);
  const qStart = d => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  const qName = d => 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
  const fDate = (d, long) => d.toLocaleDateString('en-AU', long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  const RANGES = [['7', '7 days'], ['30', '30 days'], ['quarter', 'This quarter'], ['all', 'All time']];

  function rangeBounds(rows) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = rows.length ? parse(rows[0].day) : addDays(today, -29);
    let start = S.range === '7' ? addDays(today, -6) : S.range === 'quarter' ? qStart(today) : S.range === 'all' ? first : addDays(today, -29);
    if (S.range === 'all' && dayDiff(start, today) < 6) start = addDays(today, -6);
    return { start, end: today, days: dayDiff(start, today) + 1 };
  }
  // Per-day totals for a window, optionally grouped by week for long windows.
  function series(rows, start, end) {
    const byDay = {}; rows.forEach(r => { (byDay[r.day] = byDay[r.day] || {}); byDay[r.day][r.link] = (byDay[r.day][r.link] || 0) + Number(r.clicks); });
    const days = []; for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));
    const weekly = days.length > 120, pts = [];
    days.forEach(d => {
      const key = iso(d), by = byDay[key] || {};
      let p = weekly && pts.length && d.getDay() !== 1 ? pts[pts.length - 1] : null;
      if (!p) { p = { from: new Date(d), to: new Date(d), by: {}, total: 0 }; pts.push(p); }
      p.to = new Date(d);
      Object.entries(by).forEach(([l, n]) => { p.by[l] = (p.by[l] || 0) + n; p.total += n; });
    });
    return { pts, weekly };
  }
  const totalIn = (rows, a, b) => rows.reduce((t, r) => { const d = parse(r.day); return d >= a && d <= b ? t + Number(r.clicks) : t; }, 0);
  const byLinkIn = (rows, a, b) => rows.reduce((m, r) => { const d = parse(r.day); if (d >= a && d <= b) m[r.link] = (m[r.link] || 0) + Number(r.clicks); return m; }, {});

  // ── chart: smooth monotone area chart with date axis and hover tooltip ──
  let CHART = null;
  function niceMax(m) { if (m <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(m))); for (const k of [1, 2, 2.5, 5, 10]) if (m <= k * p) return k * p; return 10 * p; }
  function monotone(xs, ys) {   // Fritsch–Carlson monotone cubic → SVG path (never overshoots, so no false dips)
    const n = xs.length; if (n < 2) return `M${xs[0]},${ys[0]}`;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) d += ` C${(xs[i] + dx[i] / 3).toFixed(1)},${(ys[i] + t[i] * dx[i] / 3).toFixed(1)} ${(xs[i + 1] - dx[i] / 3).toFixed(1)},${(ys[i + 1] - t[i + 1] * dx[i] / 3).toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
    return d;
  }
  function chartSvg(sr) {
    const { pts, weekly } = sr, W = 640, H = 190, pl = 30, pb = 22, pr = 8, pt = 10;
    const mx = niceMax(Math.max(0, ...pts.map(p => p.total)));
    const X = i => pl + (pts.length < 2 ? 0 : i * (W - pl - pr) / (pts.length - 1)), Y = v => H - pb - v * (H - pb - pt) / mx;
    const xs = pts.map((_, i) => X(i)), ys = pts.map(p => Y(p.total));
    let g = '';
    (mx >= 4 ? [0, Math.round(mx / 2), mx] : [0, mx]).forEach(v => { g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)"/><text x="0" y="${Y(v) + 4}" font-size="10" fill="var(--muted)">${v}</text>`; });
    const ticks = Math.min(5, pts.length);
    for (let k = 0; k < ticks; k++) { const i = ticks === 1 ? 0 : Math.round(k * (pts.length - 1) / (ticks - 1)); g += `<text x="${X(i)}" y="${H - 5}" font-size="10" fill="var(--muted)" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${fDate(pts[i].from)}</text>`; }
    const line = monotone(xs, ys), last = pts.length - 1;
    CHART = { pts, weekly, W, H, pl, pr, X, Y };
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Clicks over time"><defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".45"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>${g}
      <path d="${line} L${X(last)},${H - pb} L${X(0)},${H - pb}Z" fill="url(#gr)"/><path d="${line}" fill="none" stroke="var(--gold-deep)" stroke-width="2.5" stroke-linejoin="round"/>
      <line id="ch-line" y1="${pt - 4}" y2="${H - pb}" stroke="var(--gold)" stroke-dasharray="3 3" opacity="0"/><circle id="ch-dot" r="5" fill="var(--gold-deep)" stroke="var(--card)" stroke-width="2" opacity="0"/></svg><div class="tip" id="ch-tip"></div>`;
  }
  function chartHover(e, box) {
    if (!CHART) return; const svg = box.querySelector('svg'), r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) / r.width * CHART.W, n = CHART.pts.length;
    const i = Math.max(0, Math.min(n - 1, Math.round((vx - CHART.pl) / ((CHART.W - CHART.pl - CHART.pr) || 1) * (n - 1)))), p = CHART.pts[i];
    const x = CHART.X(i), y = CHART.Y(p.total), L = box.querySelector('#ch-line'), D = box.querySelector('#ch-dot'), T = box.querySelector('#ch-tip');
    L.setAttribute('x1', x); L.setAttribute('x2', x); L.setAttribute('opacity', 1); D.setAttribute('cx', x); D.setAttribute('cy', y); D.setAttribute('opacity', 1);
    const when = CHART.weekly ? `Week of ${fDate(p.from, true)}` : fDate(p.from, true);
    const parts = Object.entries(p.by).filter(([, v]) => v).map(([l, v]) => `${LINKS[l] || l} ${v}`).join(' · ');
    T.innerHTML = `${esc(when)} · <b>${p.total} click${p.total === 1 ? '' : 's'}</b>${parts ? `<br><small>${esc(parts)}</small>` : ''}`;
    T.style.left = (x / CHART.W * r.width) + 'px'; T.style.top = (y / CHART.H * r.height) + 'px'; T.style.opacity = 1;
  }

  // ── vendor data ──
  async function loadVendorData() {
    const [rows, recent, sum, refs, prof] = await Promise.all([api.rpc('vendor_clicks_all'), api.rpc('vendor_recent_clicks', { p_limit: 12 }), api.rpc('partner_summary'), api.rpc('partner_referrals'), api.select('vendor_profiles')]);
    S.avatar = initials(sum && sum.name);
    return { rows: (rows || []).map(r => ({ day: String(r.day).slice(0, 10), link: r.link, clicks: Number(r.clicks) })), recent, sum, refs, prof: (prof || [])[0] || {} };
  }
  const ago = iso => { const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };

  async function vendorOverview() {
    const { rows, recent, sum, prof } = await loadVendorData();
    const { start, end, days } = rangeBounds(rows), all = S.range === 'all';
    const by = byLinkIn(rows, start, end), total = Object.values(by).reduce((a, b) => a + b, 0);
    const prevEnd = addDays(start, -1), prevStart = addDays(start, -days), prevTotal = totalIn(rows, prevStart, prevEnd);
    const delta = all || !prevTotal ? '' : (() => { const p = Math.round((total - prevTotal) / prevTotal * 100); return `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span> vs previous ${S.range === 'quarter' ? days + ' days' : days + ' days'}`; })();
    const pct = n => total ? Math.round((n / total) * 100) + '% of clicks' : '';
    const sr = series(rows, start, end);
    const allTime = rows.reduce((t, r) => t + r.clicks, 0), firstDay = rows.length ? parse(rows[0].day) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const qrows = []; if (firstDay) for (let q = qStart(today); q >= qStart(firstDay) && qrows.length < 4; q = new Date(q.getFullYear(), q.getMonth() - 3, 1)) { const e = new Date(q.getFullYear(), q.getMonth() + 3, 0); qrows.push(`${qName(q)}${q.getTime() === qStart(today).getTime() ? ' so far' : ''}: <b>${totalIn(rows, q, e)}</b>`); }
    const order = ['website', 'contact', 'call', 'email', 'instagram', 'book'].filter(l => by[l]);
    const live = prof.published ? '✓ Listing live' : '● Not published yet';
    const rate = prof.rating_score ? `<span class="badge">★ ${esc(Number(prof.rating_score).toFixed(1))} · ${esc(prof.rating_count)} reviews</span>` : '';
    return `<div class="hero"><div class="logo">${prof.logo_path ? `<img src="${esc(photoUrl(prof.logo_path))}" alt="">` : esc(S.avatar)}</div>
      <div><h1>Welcome back 👋</h1><p>${esc(sum.name)}${prof.category_label ? ' · ' + esc(prof.category_label) : ''}</p><span class="badge">${live}</span>${rate}</div>
      <button class="cta" data-act="tab" data-tab="listing">View your listing →</button></div>
    <div class="seg" role="tablist">${RANGES.map(([k, l]) => `<button class="${S.range === k ? 'on' : ''}" data-act="range" data-range="${k}">${l}</button>`).join('')}</div>
    <div class="grid">${stat('👆', 'Total clicks', total.toLocaleString('en-AU'), delta)}${stat('🌐', 'Website', by.website || 0, pct(by.website || 0), 'var(--c-web)')}${stat('✉️', 'Contact form', by.contact || 0, pct(by.contact || 0), 'var(--c-contact)')}${stat('📞', 'Calls / emails', (by.call || 0) + (by.email || 0), pct((by.call || 0) + (by.email || 0)), 'var(--c-call)')}</div>
    <div class="two"><div class="card"><h3>Clicks over time</h3><div class="sub">${fDate(start, true)} – ${fDate(end, true)} · ${sr.weekly ? 'weekly' : 'daily'}</div>
      <div class="chartbox" data-chart="1">${total ? chartSvg(sr) : '<div class="sub" style="padding:30px 0">No clicks in this period yet.</div>'}</div></div>
      <div class="card"><h3>Where clicks go</h3><div class="sub">Share by button</div>
        ${order.map(l => `<div class="bar" style="--bc:${LCOL[l]}"><span>${esc(LINKS[l])}</span><div class="t"><i style="width:${total ? Math.round(by[l] / total * 100) : 0}%"></i></div><b>${by[l]}</b></div>`).join('') || '<div class="sub" style="margin-top:10px">Nothing yet.</div>'}
        <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px"><div class="sub">All time</div><span class="n" style="font:600 30px Georgia,serif">${allTime.toLocaleString('en-AU')}</span> <span class="sub">clicks${firstDay ? ' since ' + fDate(firstDay, false) + ' ' + firstDay.getFullYear() : ''}</span>${qrows.length ? `<br><span class="sub">${qrows.join(' · ')}</span>` : ''}</div></div></div>
    <div class="two even"><div class="card"><h3>Referrals</h3><div class="sub">Couples you’ve sent to Union Vault</div>
      <div style="display:flex;gap:26px;margin-top:10px;flex-wrap:wrap"><div><div style="font:600 34px Georgia,serif">${sum.signups}</div><div class="sub">sign-ups</div></div><div><div style="font:600 34px Georgia,serif">${sum.active_subscribers}</div><div class="sub">paying</div></div><div><div style="font:600 34px Georgia,serif;color:var(--green)">${money(sum.earned_cents)}</div><div class="sub">commission · ${pctText(sum.rate) ? pctText(sum.rate) + ' of their subscription fees' : 'rate to be agreed'}</div></div></div>
      <div style="margin-top:10px"><a href="#" data-act="tab" data-tab="referrals">Your referral link and sign-ups →</a></div></div>
      <div class="card"><h3>Latest activity</h3><table class="act">${(recent || []).slice(0, 5).map(r => `<tr><td><span class="dot" style="--bc:${LCOL[r.link] || 'var(--gold)'}"></span>${esc(LINKS[r.link] || r.link)}</td><td class="mono sub">${esc(r.visitor_id)}</td><td class="sub" style="text-align:right">${ago(r.clicked_at)}</td></tr>`).join('') || '<tr><td class="sub">No clicks yet.</td></tr>'}</table>
      <div class="sub" style="margin-top:8px">Visitors are shown by an anonymous ID only. IDs differ for each vendor.</div></div></div>`;
  }

  async function vendorReferrals() {
    const { sum, refs } = await loadVendorData();
    const link = `${C.appUrl}/?ref=${encodeURIComponent(sum.code)}`;
    const status = { active: 'Paying', trialing: 'Free trial', none: 'Signed up', past_due: 'Payment issue', canceled: 'Cancelled' };
    return `<div class="head"><div><h1>Referrals</h1><div class="sub">Couples you send to Union Vault with your link</div></div>
      <div class="linkbox"><span style="color:var(--muted)">Your referral link</span><br><b id="reflink">${esc(link)}</b> · <a href="#" data-act="copy" data-text="${esc(link)}">Copy</a></div></div>
      <div class="grid">${stat('🧑‍🤝‍🧑', 'Sign-ups', sum.signups, '')}${stat('💳', 'Paying subscribers', sum.active_subscribers, 'active now', 'var(--c-call)')}${stat('💰', 'Referral commission', money(sum.earned_cents), sum.rate == null ? 'Rate to be agreed' : pctText(sum.rate) + ' of referred users’ subscription fees', 'var(--gold)')}${stat('🗓️', 'Awaiting payout', money(sum.unpaid_cents), 'paid quarterly', 'var(--c-email)')}</div>
      <div class="eyebrow">Referred sign-ups</div>
      <div class="tablewrap"><table><tr><th>Referred user</th><th>Signed up</th><th>Plan</th><th>Status</th></tr>${(refs || []).map(r => { const st = r.cancel_state === 'ended' ? 'Cancelled' : r.cancel_state === 'requested' ? 'Cancelling' : (status[r.subscription_status] || r.subscription_status); return `<tr><td class="mono">${esc(r.anon_id)}</td><td>${fmtDay(r.signed_up_at)}</td><td>${planText(r.plan_months, r.plan_amount_cents)}</td><td>${esc(st)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="sub">No sign-ups yet.</td></tr>'}</table></div>
      <div class="sub" style="margin-top:8px">Referred users are shown by an anonymous ID only — no names or emails.</div>
      <div class="eyebrow">Quarterly statements</div>${await statementsHtml()}`;
  }
  // One row per calendar quarter; "View" opens the lines (anonymous client ID, what they paid, your commission).
  async function statementsHtml() {
    const rows = await api.rpc('partner_statements');
    if (!(rows || []).length) return '<div class="card sub">No commission yet. Statements appear here once the couples you refer start paying.</div>';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return `<div class="tablewrap"><table><tr><th>Quarter</th><th>Commission</th><th>Status</th><th></th></tr>${rows.map(r => {
      const ps = parse(String(r.period_start).slice(0, 10)), pe = parse(String(r.period_end).slice(0, 10)), key = iso(ps), open = S.stmt === key;
      const st = r.paid ? `Paid${r.paid_at ? ' ' + fmtDay(r.paid_at) : ''}${r.reference ? ' · ' + esc(r.reference) : ''}` : pe < today ? 'Awaiting payout' : 'In progress';
      return `<tr><td>${esc(qName(ps))}</td><td>${money(r.earned_cents)}</td><td>${st}</td><td style="text-align:right"><a href="#" data-act="stmt" data-p="${key}">${open ? 'Hide' : 'View lines'}</a></td></tr>${open ? '<tr><td colspan="4" id="stmtlines" class="sub">Loading…</td></tr>' : ''}`;
    }).join('')}</table></div><div class="sub" style="margin-top:8px">Paid quarterly in arrears, after allowing for refunds. A refund after a payout is taken off your next one.</div>`;
  }
  async function loadStatementLines() {
    const el = document.getElementById('stmtlines'); if (!el || !S.stmt) return;
    const lines = await api.rpc('partner_statement_lines', { p_period: S.stmt });
    const kind = { first: 'First payment', renewal: 'Renewal', reversal: 'Refund / reversal', cancel_requested: 'Cancellation requested', cancelled: 'Subscription cancelled', resumed: 'Subscription resumed' };
    const money2 = (l, v) => (['first', 'renewal', 'reversal'].includes(l.kind) ? money(v) : '<span class="sub">—</span>');
    el.className = ''; el.style.padding = '0';
    el.innerHTML = `<table style="background:var(--surface)"><tr><th>Date</th><th>Referred client</th><th>Event</th><th>Plan</th><th style="text-align:right">They paid</th><th style="text-align:right">Your commission</th></tr>${(lines || []).map(l => `<tr><td>${fmtDay(l.occurred_at)}</td><td class="mono">${esc(l.anon_id)}</td><td>${kind[l.kind] || esc(l.kind)}</td><td>${['first', 'renewal'].includes(l.kind) ? planText(l.plan_months, l.paid_cents) : '<span class="sub">—</span>'}</td><td style="text-align:right">${money2(l, l.paid_cents)}</td><td style="text-align:right">${money2(l, l.commission_cents)}</td></tr>`).join('') || '<tr><td colspan="6" class="sub">No lines.</td></tr>'}</table>`;
  }

  // ── listing editor ──
  const TEXT_FIELDS = [['name', 'Business name'], ['category_label', 'Category'], ['phone', 'Phone'], ['email', 'Email'], ['area', 'Service area'], ['hours', 'Opening hours'], ['website_url', 'Website link'], ['contact_url', 'Contact form link'], ['instagram_url', 'Instagram link']];
  const UNITS = { package: 'per package', hour: 'per hour', day: 'per day', person: 'per person', event: 'per event' };
  const UNIT_SUFFIX = { package: '', hour: '/ hour', day: '/ day', person: '/ person', event: '/ event' };
  const newPkg = () => ({ name: '', included: '', price_type: 'fixed', price_min: '', price_max: '', unit: 'package', note: '', visible: true, popular: false });
  const dollars = n => '$' + Number(n || 0).toLocaleString('en-AU');
  function priceHtml(p) {
    if (p.price_type === 'request') return '<span class="price" style="font-size:16px">Price on request</span>';
    const main = p.price_type === 'range' ? `${dollars(p.price_min)} – ${dollars(p.price_max)}` : (p.price_type === 'from' ? 'from ' : '') + dollars(p.price_min);
    const u = UNIT_SUFFIX[p.unit || 'package']; return `<span class="price">${esc(main)}${u ? ` <small>${u}</small>` : ''}</span>`;
  }
  function pkgPreview(d) {
    const list = (d.packages || []).filter(p => p.visible && p.name);
    if (!d.packages_visible || !list.length) return '';
    return `<div class="card"><div class="lbl" style="margin-top:0">Packages</div>${list.map(p => `<div class="pkc${p.popular ? ' feat' : ''}">${p.popular ? '<span class="ribbon">Most popular</span>' : ''}<div class="top2"><b>${esc(p.name)}</b>${priceHtml(p)}</div>${p.included ? `<div class="sub">${esc(p.included)}</div>` : ''}${p.note ? `<div class="sub" style="margin-top:4px">${esc(p.note)}</div>` : ''}</div>`).join('')}<div class="sub" style="margin-top:10px">Prices are a guide set by the vendor. Message us for a quote.</div></div>`;
  }
  function cardPreview(d, prof) {
    const ph = (d.photos || [])[0], rt = prof.rating_score ? `<div class="stars" style="margin:6px 0">★★★★★ <span class="sub" style="letter-spacing:0">${esc(Number(prof.rating_score).toFixed(1))} · ${esc(prof.rating_count)} Google reviews</span></div>` : '';
    const gal = (d.photos || []).slice(1, 5).map(p => `<div style="background-image:url('${esc(photoUrl(p))}')"></div>`).join('');
    return `<div class="card pvcard"><div class="cover"${ph ? ` style="background-image:url('${esc(photoUrl(ph))}')"` : ''}></div><div class="bd"><div class="tagline">${esc(prof.tag || 'Preferred vendor')}</div>
      <div style="font:600 22px Georgia,serif">${esc(d.name)}</div><div class="sub">${esc(d.category_label)}</div>${rt}
      ${d.area ? `<div style="margin:6px 0"><span class="sub">Services:</span> ${esc(d.area)}</div>` : ''}<div class="sub">${esc([d.hours, d.phone].filter(Boolean).join(' · '))}</div>
      ${gal ? `<div class="gal">${gal}</div>` : ''}${d.bio ? `<div style="margin-top:8px;font-size:13px">${esc(d.bio)}</div>` : ''}</div></div>`;
  }
  function strength(d) {
    const checks = [d.photos.length >= 1, d.photos.length >= 3, !!d.logo_path, (d.bio || '').length >= 80, !!d.area, !!(d.phone || d.email), d.packages.some(p => p.visible && p.name)];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }
  const pkgEditor = (p, i, n) => `<div class="pk${p.visible ? '' : ' off'}" data-pk="${i}"><div class="hd"><b style="flex:1">${esc(p.name) || 'Package ' + (i + 1)} ${p.popular ? '<span class="ribbon" style="margin-left:6px">Most popular</span>' : ''}</b>
    <button class="btn sm" data-act="pk-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">↑</button><button class="btn sm" data-act="pk-down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">↓</button>
    <span class="sub">${p.visible ? 'Show' : 'Hidden'}</span><button class="tog${p.visible ? ' on' : ''}" data-act="pk-vis" data-i="${i}" role="switch" aria-checked="${p.visible}" aria-label="Show this package"></button></div>
    <label>Name</label><input data-pkf="name" data-i="${i}" maxlength="80" value="${esc(p.name)}">
    <label>What’s included</label><textarea rows="2" data-pkf="included" data-i="${i}" maxlength="400">${esc(p.included)}</textarea>
    <label>Price</label><div class="seg2">${[['fixed', 'Fixed'], ['range', 'Range'], ['from', 'From'], ['request', 'On request']].map(([k, l]) => `<button class="${p.price_type === k ? 'on' : ''}" data-act="pk-type" data-i="${i}" data-type="${k}">${l}</button>`).join('')}</div>
    ${p.price_type === 'request' ? '' : `<div class="pr"><span>$</span><input type="number" min="0" step="1" inputmode="decimal" data-pkf="price_min" data-i="${i}" value="${esc(p.price_min)}" aria-label="Price">${p.price_type === 'range' ? `<span>to $</span><input type="number" min="0" step="1" inputmode="decimal" data-pkf="price_max" data-i="${i}" value="${esc(p.price_max)}" aria-label="Highest price">` : ''}
      <select data-pkf="unit" data-i="${i}" aria-label="Price unit">${Object.entries(UNITS).map(([k, l]) => `<option value="${k}"${p.unit === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`}
    <label>Note under price (optional)</label><input data-pkf="note" data-i="${i}" maxlength="80" value="${esc(p.note)}" placeholder="e.g. GST included">
    <div class="pr" style="margin-top:12px"><button class="btn sm" data-act="pk-pop" data-i="${i}">${p.popular ? '★ Unmark most popular' : '☆ Mark as most popular'}</button><button class="btn sm" data-act="pk-del" data-i="${i}">Delete</button></div></div>`;

  function listingBody(prof) {
    const d = S.draft, last = prof._last;
    return `<div class="cols"><div><div class="head" style="margin-bottom:8px"><div><h1>Your listing</h1><div class="sub">What couples see on Union Vault’s Recommended vendors page</div></div></div>
      <div class="note">Changes are reviewed by Union Vault before they appear (usually within a day). The Google rating and our note about you are added by Union Vault.</div>
      ${last && last.status === 'pending' ? '<div class="note">You have a change waiting for review. Submitting again replaces it.</div>' : ''}
      ${last && last.status === 'rejected' ? `<div class="note err">Your last change wasn’t approved${last.review_note ? ': ' + esc(last.review_note) : ''}.</div>` : ''}
      <div class="card" id="strength"></div>
      <div class="lbl" style="margin-top:0">Photos</div>
      <div class="drop" id="drop" data-act="pick"><div style="font-size:26px">📷</div><b>${S.uploading ? 'Uploading…' : 'Drag photos here or tap to browse'}</b><div class="sub">JPG, PNG or WebP · up to 8 photos · the first is your cover</div></div>
      <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="thumbs" id="thumbs">${d.photos.map((p, i) => `<div class="th" draggable="true" data-i="${i}" style="background-image:url('${esc(photoUrl(p))}')">${i === 0 ? '<span class="cov">Cover</span>' : ''}<span class="xs">${i ? `<button data-act="ph-cover" data-i="${i}" title="Make cover" aria-label="Make cover">★</button>` : ''}<button data-act="ph-del" data-i="${i}" title="Remove" aria-label="Remove photo">×</button></span></div>`).join('')}</div>
      <div class="lbl">Logo (optional, square)</div><div class="logoin"><span class="av">${d.logo_path ? `<img src="${esc(photoUrl(d.logo_path))}" alt="">` : esc(initials(d.name))}</span><button class="btn sm" data-act="pick-logo">${d.logo_path ? 'Change logo' : 'Upload a logo'}</button>${d.logo_path ? '<button class="btn sm" data-act="logo-del">Remove</button>' : ''}</div>
      <input type="file" id="logofile" accept="image/jpeg,image/png,image/webp" hidden>
      <form id="profileform">${TEXT_FIELDS.map(([k, l]) => `<div class="field"><label for="f-${k}">${l}</label>${k === 'area' || k === 'hours' ? `<textarea rows="2" id="f-${k}" data-k="${k}">${esc(d[k])}</textarea>` : `<input id="f-${k}" data-k="${k}" value="${esc(d[k])}" ${k.endsWith('_url') ? 'placeholder="https://… (leave blank to keep the current link)"' : ''}>`}</div>`).join('')}
      <div class="field"><label for="f-bio">About your business</label><textarea rows="5" id="f-bio" data-k="bio" maxlength="1500" placeholder="A few friendly sentences couples will read on your page.">${esc(d.bio)}</textarea></div>
      <div class="eyebrow">Packages &amp; pricing <span style="text-transform:none;letter-spacing:0">(optional)</span></div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><b>Show packages &amp; pricing on my page</b><div class="sub">Turn off to hide the whole section</div></div><button type="button" class="tog${d.packages_visible ? ' on' : ''}" data-act="pk-all" role="switch" aria-checked="${d.packages_visible}" aria-label="Show packages"></button></div>
      <div id="pkgs">${d.packages.map((p, i) => pkgEditor(p, i, d.packages.length)).join('')}</div>
      ${d.packages.length < 12 ? '<button type="button" class="add" data-act="pk-add">＋ Add a package</button>' : ''}
      <div style="margin-top:18px"><button class="btn primary">Submit for review</button></div></form></div>
      <div><div class="lbl" style="margin-top:0">How couples see it</div><div id="preview">${cardPreview(d, prof)}${pkgPreview(d)}</div></div></div>`;
  }
  const refreshPreview = () => { const pv = document.getElementById('preview'), s = document.getElementById('strength'); if (pv) pv.innerHTML = cardPreview(S.draft, S.prof) + pkgPreview(S.draft); if (s) { const v = strength(S.draft); s.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>Listing strength</b><span class="sub">${v}%${v < 100 ? ' · add photos, a logo and an about section to reach 100%' : ' · looking great'}</span></div><div class="meter"><i style="width:${v}%"></i></div>`; } };
  function toDraft(p) {
    const d = { photos: Array.isArray(p.photos) ? p.photos.slice() : [], logo_path: p.logo_path || '', bio: p.bio || '', packages_visible: p.packages_visible !== false, packages: (Array.isArray(p.packages) ? p.packages : []).map(x => Object.assign(newPkg(), x)) };
    TEXT_FIELDS.forEach(([k]) => { d[k] = k.endsWith('_url') ? '' : (p[k] == null ? '' : p[k]); });
    return d;
  }
  async function vendorProfile() {
    const vid = await api.rpc('my_vendor_id');
    if (!vid) return '<div class="note">Your account isn’t linked to a listing yet.</div>';
    S.vendorId = vid;
    const [rows, ch] = await Promise.all([api.select('vendor_profiles', { eq: { vendor_id: vid } }), api.select('vendor_profile_changes', { eq: { vendor_id: vid }, order: 'submitted_at', limit: 1 })]);
    const p = rows[0] || {}; p._last = ch && ch[0]; S.prof = p;
    if (!S.draft) { S.orig = toDraft(p); S.draft = JSON.parse(JSON.stringify(S.orig)); }
    return listingBody(p);
  }
  function rerenderListing() { const wrap = document.querySelector('.wrap'); if (!wrap) return; const y = window.scrollY; wrap.innerHTML = (S.msg ? `<div class="note ${S.msg.kind || ''}">${esc(S.msg.text)}</div>` : '') + listingBody(S.prof); refreshPreview(); window.scrollTo(0, y); }

  async function shrink(file) {   // resize to max 1600px and re-encode as JPEG so uploads stay small and uniform
    const bmp = await createImageBitmap(file), s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not read that image')), 'image/jpeg', .85));
  }
  async function addFiles(files, asLogo) {
    const list = Array.from(files).filter(f => /^image\/(jpeg|png|webp)$/.test(f.type)); if (!list.length) { S.msg = { kind: 'err', text: 'Please choose JPG, PNG or WebP images.' }; return rerenderListing(); }
    S.uploading = true; rerenderListing();
    try {
      for (const f of (asLogo ? list.slice(0, 1) : list)) {
        if (!asLogo && S.draft.photos.length >= 8) { S.msg = { kind: 'err', text: 'You can add up to 8 photos.' }; break; }
        const blob = await shrink(f); if (blob.size > 5 * 1024 * 1024) { S.msg = { kind: 'err', text: 'That image is still over 5 MB after resizing.' }; continue; }
        const path = api.demo ? URL.createObjectURL(blob) : await api.upload(`${S.vendorId}/${crypto.randomUUID()}.jpg`, blob);
        if (asLogo) S.draft.logo_path = path; else S.draft.photos.push(path);
      }
    } catch (err) { S.msg = { kind: 'err', text: 'Upload failed: ' + (err.message || err) }; }
    S.uploading = false; rerenderListing();
  }
  function listingDiff() {
    const d = S.draft, o = S.orig, diff = {};
    TEXT_FIELDS.forEach(([k]) => { const v = String(d[k] || '').trim(); if (k.endsWith('_url') ? v !== '' : v !== String(o[k] || '')) diff[k] = v; });
    if ((d.bio || '').trim() !== (o.bio || '')) diff.bio = (d.bio || '').trim();
    if (JSON.stringify(d.photos) !== JSON.stringify(o.photos)) diff.photos = d.photos;
    if ((d.logo_path || '') !== (o.logo_path || '')) diff.logo_path = d.logo_path || '';
    if (d.packages_visible !== o.packages_visible) diff.packages_visible = d.packages_visible;
    const cleanPk = d.packages.filter(p => p.name.trim()).map(p => { const x = { name: p.name.trim(), included: (p.included || '').trim(), price_type: p.price_type, unit: p.unit || 'package', note: (p.note || '').trim(), visible: !!p.visible, popular: !!p.popular }; if (p.price_type !== 'request') { x.price_min = Number(p.price_min || 0); if (p.price_type === 'range') x.price_max = Number(p.price_max || 0); } return x; });
    const origPk = o.packages.filter(p => p.name.trim()).map(p => { const x = { name: p.name.trim(), included: (p.included || '').trim(), price_type: p.price_type, unit: p.unit || 'package', note: (p.note || '').trim(), visible: !!p.visible, popular: !!p.popular }; if (p.price_type !== 'request') { x.price_min = Number(p.price_min || 0); if (p.price_type === 'range') x.price_max = Number(p.price_max || 0); } return x; });
    if (JSON.stringify(cleanPk) !== JSON.stringify(origPk)) diff.packages = cleanPk;
    return diff;
  }

  async function vendorTerms() {
    const [terms, acc] = await Promise.all([api.select('partner_terms', { order: 'effective_from', limit: 1 }), api.select('partner_terms_acceptances')]);
    const t = terms && terms[0]; if (!t) return '<div class="head"><h1>Agreement</h1></div><div class="note">No agreement has been published yet.</div>';
    const done = (acc || []).some(a => a.terms_id === t.id);
    return `<div class="head"><div><h1>${esc(t.title)}</h1><div class="sub">Version ${esc(t.version)}</div></div></div><div class="terms">${esc(t.body_md)}</div>
      ${done ? '<div class="note ok" style="margin-top:14px">You have accepted these terms.</div>' : `<div style="margin-top:14px"><button class="btn primary" data-act="accept" data-id="${esc(t.id)}">I accept these terms</button></div>`}`;
  }

  // ── admin ──
  function fmtChange(k, v) {
    if (k === 'photos') return `${v.length} photo${v.length === 1 ? '' : 's'}: ` + v.map(p => `<a href="${esc(photoUrl(p))}" target="_blank" rel="noopener">view</a>`).join(' · ');
    if (k === 'logo_path') return v ? `<a href="${esc(photoUrl(v))}" target="_blank" rel="noopener">new logo</a>` : 'remove logo';
    if (k === 'packages') return v.length ? v.map(p => esc(p.name) + ' — ' + (p.price_type === 'request' ? 'price on request' : p.price_type === 'range' ? `${dollars(p.price_min)}–${dollars(p.price_max)}` : (p.price_type === 'from' ? 'from ' : '') + dollars(p.price_min)) + (p.price_type !== 'request' && UNIT_SUFFIX[p.unit] ? ' ' + UNIT_SUFFIX[p.unit] : '') + (p.visible ? '' : ' (hidden)')).join('<br>') : 'no packages';
    return esc(v);
  }
  async function adminOverview() {
    const [ov, ch, rc] = await Promise.all([api.rpc('admin_partner_overview', { p_days: C.clickDays }), api.select('vendor_profile_changes', { eq: { status: 'pending' } }), api.rpc('admin_recent_clicks', { p_limit: 40 })]);
    const sum = k => (ov || []).reduce((a, r) => a + Number(r[k] || 0), 0);
    return `<div class="head"><div><h1>All vendors</h1><div class="sub">Last ${C.clickDays} days</div></div></div>
      <div class="grid">${stat('👆', 'Clicks to vendors', sum('clicks'), '')}${stat('🧑‍🤝‍🧑', 'Referred sign-ups', sum('signups'), '', 'var(--c-web)')}${stat('💳', 'Paying referred', sum('paying'), '', 'var(--c-call)')}${stat('💰', 'Referral commission', money(sum('commission_cents')), 'all time')}</div>
      <div class="eyebrow">Vendors</div>
      <div class="tablewrap"><table><tr><th>Vendor</th><th>Clicks</th><th>Contact form</th><th>Calls / emails</th><th>Sign-ups</th><th>Paying</th><th>Commission</th></tr>${(ov || []).map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${r.clicks}</td><td>${r.contact_form}</td><td>${r.calls_emails}</td><td>${r.signups}</td><td>${r.paying}</td><td>${money(r.commission_cents)}</td></tr>`).join('') || '<tr><td colspan="7" class="sub">No vendors yet.</td></tr>'}</table></div>
      <div class="eyebrow">Profile changes to review (${(ch || []).length})</div>
      ${(ch || []).map(c => `<div class="card"><b>${esc(c.vendor_id)}</b> <span class="sub">· ${fmtWhen(c.submitted_at)}</span><div style="font-size:12.5px;margin:8px 0">${Object.entries(c.proposed || {}).map(([k, v]) => `<div><span class="sub">${esc(k)}:</span> ${fmtChange(k, v)}</div>`).join('')}</div>
        <button class="btn primary" data-act="review" data-id="${esc(c.id)}" data-ok="1">Approve</button> <button class="btn" data-act="review" data-id="${esc(c.id)}" data-ok="0">Reject</button></div>`).join('') || '<div class="sub">Nothing waiting.</div>'}
      <div class="eyebrow">Recent clicks (who)</div>
      <div class="tablewrap"><table><tr><th>When</th><th>Vendor</th><th>Button</th><th>Signed-in user</th></tr>${(rc || []).filter(r => !r.is_bot).map(r => `<tr><td>${fmtWhen(r.clicked_at)}</td><td>${esc(r.vendor_id)}</td><td>${esc(LINKS[r.link] || r.link)}</td><td>${esc(r.user_email || 'guest')}</td></tr>`).join('')}</table></div>`;
  }

  async function adminPayouts() {
    const [ov, po] = await Promise.all([api.rpc('admin_payout_overview'), api.rpc('admin_payouts')]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lq = new Date(qStart(today).getFullYear(), qStart(today).getMonth() - 3, 1), lqKey = iso(lq);
    const sum = k => (ov || []).reduce((a, r) => a + Number(r[k] || 0), 0);
    return `<div class="head"><div><h1>Payouts</h1><div class="sub">Quarterly, in arrears. Last finished quarter: ${esc(qName(lq))}</div></div></div>
      <div class="grid">${stat('🕒', 'Owed, not yet in a payout', money(sum('unpaid_cents')), '')}${stat('📝', 'In draft payouts', money(sum('in_draft_cents')), '', 'var(--c-email)')}${stat('✅', 'Paid so far', money(sum('paid_cents')), '', 'var(--c-call)')}</div>
      <div class="eyebrow">Partners</div>
      <div class="tablewrap"><table><tr><th>Partner</th><th>Rate</th><th>Owed</th><th>In draft</th><th>Paid</th><th></th></tr>${(ov || []).map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${r.rate == null ? '<span class="sub">to be agreed</span>' : pctText(r.rate)}</td><td>${money(r.unpaid_cents)}</td><td>${money(r.in_draft_cents)}</td><td>${money(r.paid_cents)}</td>
        <td style="text-align:right"><button class="btn sm" data-act="payout-create" data-partner="${esc(r.partner_id)}" data-q="${lqKey}" ${Number(r.unpaid_cents) > 0 ? '' : 'disabled'}>Create ${esc(qName(lq))} payout</button></td></tr>`).join('') || '<tr><td colspan="6" class="sub">No partners yet.</td></tr>'}</table></div>
      <div class="eyebrow">Payouts</div>
      <div class="tablewrap"><table><tr><th>Quarter</th><th>Partner</th><th>Amount</th><th>Status</th><th></th></tr>${(po || []).map(p => `<tr><td>${esc(qName(parse(String(p.period_start).slice(0, 10))))}</td><td>${esc(p.name)}</td><td>${money(p.total_cents)}</td>
        <td>${p.status === 'paid' ? `Paid ${fmtDay(p.paid_at)}${p.reference ? ' · ' + esc(p.reference) : ''}` : 'Draft'}</td>
        <td style="text-align:right">${p.status === 'draft' ? `<input id="ref-${esc(p.id)}" placeholder="Bank reference" style="width:150px;padding:5px 8px;margin-right:6px"><button class="btn primary sm" data-act="payout-paid" data-id="${esc(p.id)}">Mark paid</button> <button class="btn sm" data-act="payout-void" data-id="${esc(p.id)}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">No payouts yet.</td></tr>'}</table></div>
      <div class="sub" style="margin-top:8px">A draft locks in everything owed up to the end of that quarter. Pay the partner by bank transfer, then enter the reference and mark it paid. A payout that would be zero or negative is not created: it carries forward.</div>`;
  }

  // ── routing ──
  async function render() {
    try {
      let tabs, body;
      if (S.role === 'admin') { tabs = [['overview', 'Overview'], ['payouts', 'Payouts']]; if (S.tab !== 'payouts') S.tab = 'overview'; body = S.tab === 'payouts' ? await adminPayouts() : await adminOverview(); }
      else if (S.role === 'vendor') {
        tabs = [['overview', 'Overview'], ['listing', 'Your listing'], ['referrals', 'Referrals'], ['agreement', 'Agreement']]; if (!S.tab) S.tab = 'overview';
        body = S.tab === 'listing' ? await vendorProfile() : S.tab === 'referrals' ? await vendorReferrals() : S.tab === 'agreement' ? await vendorTerms() : await vendorOverview();
      } else { tabs = []; body = '<div class="note">Your account isn’t linked to a vendor listing yet. Please contact <a href="mailto:support@unionvault.app">support@unionvault.app</a>.</div>'; }
      app.innerHTML = shell(tabs, body);
      if (S.tab === 'listing' && S.role === 'vendor') refreshPreview();
      if (S.tab === 'referrals' && S.role === 'vendor') loadStatementLines();
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
      const diff = listingDiff();
      if (S.draft.packages.some(p => p.name.trim() && p.price_type !== 'request' && (p.price_min === '' || (p.price_type === 'range' && (p.price_max === '' || Number(p.price_max) < Number(p.price_min)))))) { S.msg = { kind: 'err', text: 'Please fill in each package’s price (a range needs a highest price at least as high as the lowest).' }; return rerenderListing(); }
      try { const r = await api.rpc('submit_profile_change', { p: diff }); S.msg = r && r.ok ? { kind: 'ok', text: 'Submitted. We’ll review it shortly.' } : { kind: 'err', text: r && r.error === 'nothing_to_change' ? 'You haven’t changed anything.' : 'That change couldn’t be submitted (' + (r && r.error) + ').' }; }
      catch (err) { S.msg = { kind: 'err', text: 'Could not submit: ' + (err.message || err) }; }
      if (S.msg.kind === 'ok') { S.draft = null; }
      window.scrollTo(0, 0); render();
    }
  });
  app.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return; const act = el.dataset.act, i = Number(el.dataset.i), d = S.draft;
    if (act === 'signout') { e.preventDefault(); api.signOut(); }
    if (act === 'tab') { e.preventDefault(); S.tab = el.dataset.tab; render(); }
    if (act === 'range') { S.range = el.dataset.range; render(); }
    if (act === 'copy') { e.preventDefault(); try { await navigator.clipboard.writeText(el.dataset.text); el.textContent = 'Copied'; } catch (_) {} }
    if (act === 'accept') { try { await api.rpc('accept_terms', { p_terms: el.dataset.id }); S.msg = { kind: 'ok', text: 'Thank you — terms accepted.' }; } catch (err) { S.msg = { kind: 'err', text: 'Could not record acceptance: ' + (err.message || err) }; } render(); }
    if (act === 'stmt') { e.preventDefault(); S.stmt = S.stmt === el.dataset.p ? null : el.dataset.p; render(); }
    if (act === 'payout-create' || act === 'payout-paid' || act === 'payout-void') {
      const say = { created: 'Draft payout created.', nothing_due: 'Nothing is due for that partner (any negative balance carries forward).', exists: 'A payout for that quarter already exists.',
        quarter_not_finished: 'That quarter has not finished yet.', paid: 'Marked as paid.', already_paid: 'Already marked as paid.', voided: 'Draft cancelled.', not_a_draft: 'Only drafts can be cancelled.', admin_only: 'Admin only.' };
      try {
        const r = act === 'payout-create' ? await api.rpc('affiliate_create_payout', { p_partner: el.dataset.partner, p_quarter_start: el.dataset.q })
          : act === 'payout-paid' ? await api.rpc('affiliate_mark_payout_paid', { p_payout: el.dataset.id, p_reference: (document.getElementById('ref-' + el.dataset.id) || {}).value || '' })
          : await api.rpc('affiliate_void_payout', { p_payout: el.dataset.id });
        S.msg = { kind: ['created', 'paid', 'voided'].includes(r && r.status) ? 'ok' : '', text: say[r && r.status] || ('Result: ' + (r && r.status)) };
      } catch (err) { S.msg = { kind: 'err', text: err.message || String(err) }; }
      render();
    }
    if (act === 'review') { try { await api.rpc('review_profile_change', { p_id: el.dataset.id, p_approve: el.dataset.ok === '1' }); S.msg = { kind: 'ok', text: el.dataset.ok === '1' ? 'Approved.' : 'Rejected.' }; } catch (err) { S.msg = { kind: 'err', text: err.message || String(err) }; } render(); }
    if (!d) return;
    if (act === 'pick') document.getElementById('file').click();
    if (act === 'pick-logo') document.getElementById('logofile').click();
    if (act === 'logo-del') { d.logo_path = ''; rerenderListing(); }
    if (act === 'ph-del') { d.photos.splice(i, 1); rerenderListing(); }
    if (act === 'ph-cover') { d.photos.unshift(d.photos.splice(i, 1)[0]); rerenderListing(); }
    if (act === 'pk-add') { d.packages.push(newPkg()); rerenderListing(); }
    if (act === 'pk-del') { d.packages.splice(i, 1); rerenderListing(); }
    if (act === 'pk-up' && i > 0) { d.packages.splice(i - 1, 0, d.packages.splice(i, 1)[0]); rerenderListing(); }
    if (act === 'pk-down' && i < d.packages.length - 1) { d.packages.splice(i + 1, 0, d.packages.splice(i, 1)[0]); rerenderListing(); }
    if (act === 'pk-vis') { d.packages[i].visible = !d.packages[i].visible; rerenderListing(); }
    if (act === 'pk-all') { d.packages_visible = !d.packages_visible; rerenderListing(); }
    if (act === 'pk-type') { e.preventDefault(); d.packages[i].price_type = el.dataset.type; rerenderListing(); }
    if (act === 'pk-pop') { const was = d.packages[i].popular; d.packages.forEach(p => { p.popular = false; }); d.packages[i].popular = !was; rerenderListing(); }
  });
  app.addEventListener('input', e => {   // keep the draft in step and refresh the live preview
    const t = e.target, d = S.draft; if (!d || !t.dataset) return;
    if (t.dataset.k) d[t.dataset.k] = t.value;
    else if (t.dataset.pkf) d.packages[Number(t.dataset.i)][t.dataset.pkf] = t.value;
    else return;
    refreshPreview();
  });
  app.addEventListener('change', e => {
    if (e.target.id === 'file') addFiles(e.target.files, false);
    if (e.target.id === 'logofile') addFiles(e.target.files, true);
  });
  app.addEventListener('pointermove', e => { const b = e.target.closest && e.target.closest('[data-chart]'); if (b) chartHover(e, b); });
  app.addEventListener('pointerleave', e => { const t = document.getElementById('ch-tip'); if (t) t.style.opacity = 0; }, true);
  // drag & drop: files onto the drop zone, and reordering thumbnails
  let dragIdx = null;
  app.addEventListener('dragstart', e => { const th = e.target.closest && e.target.closest('.th'); if (th) { dragIdx = Number(th.dataset.i); th.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'photo'); } catch (_) {} } });
  app.addEventListener('dragend', () => { dragIdx = null; document.querySelectorAll('.th.dragging').forEach(x => x.classList.remove('dragging')); });
  app.addEventListener('dragover', e => { if (e.target.closest && (e.target.closest('#drop') || e.target.closest('.th'))) { e.preventDefault(); const z = e.target.closest('#drop'); if (z) z.classList.add('over'); } });
  app.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('#drop'); if (z) z.classList.remove('over'); });
  app.addEventListener('drop', e => {
    const z = e.target.closest && e.target.closest('#drop'), th = e.target.closest && e.target.closest('.th');
    if (z) { e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files, false); }
    else if (th && dragIdx !== null && S.draft) { e.preventDefault(); const to = Number(th.dataset.i); if (to !== dragIdx) { S.draft.photos.splice(to, 0, S.draft.photos.splice(dragIdx, 1)[0]); rerenderListing(); } dragIdx = null; }
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
