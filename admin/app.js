/* Lucas staff site: inquiries with FOB prices, parts editor, price upload, number lookup.
   Data lives in the Supabase "Master Data" project. Access is enforced by the database (row level security):
   staff with role "editor" (data team) can change parts and prices, "viewer" (product, sales) can only read.
   The key below is the public (anon) key: on its own it cannot read anything. */
(function () {
  'use strict';
  var SB_URL = 'https://kyegujgvlsbttyrlibgn.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZWd1amd2bHNidHR5cmxpYmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNTQ4NjUsImV4cCI6MjEwNjgzMDg2NX0.qw8n7Y9l8zO-npZ4BDlqK9PvksRQpEVg6BxqEo_MnWs';
  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  var PAGE = 100;
  var ROLE = null, EMAIL = '', CATS = [], recovering = false;

  // ---------- helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clean(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function isEditor() { return ROLE === 'editor'; }
  function money(v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dt(v) { if (!v) return ''; var d = new Date(v); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function label(k) { return ({ lucas_pn: 'Lucas PN', fob_usd: 'FOB USD', exw_usd: 'EXW USD', rp_cif: 'RP CIF', net_cif: 'Net CIF', cost_zenter: 'Cost Zenter', oe_numbers: 'OE numbers', hs_code: 'HS code', current_a: 'Current', supplier_pn: 'Supplier PN', zp_pn: 'ZP PN', units_per_box: 'Units / box', units_per_carton: 'Units / carton' })[k] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ').replace(/ dia$/, ' Ø')); }
  var NUMCOLS = /^(fob_usd|exw_usd|cost_zenter|rp_cif|net_cif|vehicle_count|units_per_box|units_per_carton|net_weight_kg|gross_weight_kg)$/;
  var PCTCOLS = /^(margin|markup)$/;
  function cell(k, v) {
    if (v == null) return '<td></td>';
    if (NUMCOLS.test(k)) return '<td class="num">' + (/usd|cif|cost/.test(k) ? money(v) : esc(v)) + '</td>';
    if (PCTCOLS.test(k)) return '<td class="num">' + (Number(v) * 100).toFixed(1) + '%</td>';
    if (k === 'lucas_pn') return '<td class="pn">' + esc(v) + '</td>';
    var s = String(v); return '<td class="clip" title="' + esc(s.length > 60 ? s : '') + '">' + esc(s) + '</td>';
  }
  var toastT;
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3500); }
  function fail(e) { console.error(e); toast('Something went wrong: ' + (e && (e.message || e.details) || e)); }
  function must(res) { if (res.error) throw res.error; return res.data; }
  function pager(el, page, count, go) {
    var pages = Math.max(1, Math.ceil(count / PAGE));
    el.innerHTML = '<button class="btn ghost small" ' + (page <= 0 ? 'disabled' : '') + ' data-p="-1">‹ Previous</button>' +
      '<span>Page ' + (page + 1) + ' of ' + pages + ' · ' + count.toLocaleString() + ' rows</span>' +
      '<button class="btn ghost small" ' + (page >= pages - 1 ? 'disabled' : '') + ' data-p="1">Next ›</button>';
    el.onclick = function (e) { var b = e.target.closest('button[data-p]'); if (b && !b.disabled) go(page + Number(b.dataset.p)); };
  }
  // all rows of a table or view (the API returns at most 1,000 rows per request)
  async function fetchAll(from, cols, tweak) {
    var out = [], i = 0;
    for (;;) {
      var q = sb.from(from).select(cols).range(i, i + 999);
      if (tweak) q = tweak(q);
      var rows = must(await q); out = out.concat(rows);
      if (rows.length < 1000) return out; i += 1000;
    }
  }
  function chunks(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function orSearch(cols, text) {
    var s = text.replace(/[,()*%\\"]/g, ' ').trim(); if (!s) return null;
    return cols.map(function (c) { return c + '.ilike.*' + s + '*'; }).join(',');
  }

  // ---------- Excel (ExcelJS is already self-hosted for the cart) ----------
  var excelP;
  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!excelP) excelP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '/assets/vendor-exceljs.min.js';
      s.onload = function () { res(window.ExcelJS); }; s.onerror = function () { rej(new Error('Excel library did not load')); };
      document.head.appendChild(s);
    });
    return excelP;
  }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  async function saveXlsx(sheets, name) {
    var X = await loadExcel(), wb = new X.Workbook();
    sheets.forEach(function (sh) {
      var ws = wb.addWorksheet(sh.name);
      (sh.top || []).forEach(function (r) { ws.addRow(r); });
      var hr = ws.addRow(sh.head); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hr.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00954C' } }; });
      sh.rows.forEach(function (r) { ws.addRow(r); });
      (sh.foot || []).forEach(function (r) { ws.addRow(r).font = { bold: true }; });
      sh.head.forEach(function (h, i) { ws.getColumn(i + 1).width = Math.min(60, Math.max(10, String(h).length + 4, (sh.widths || [])[i] || 0)); });
      if (sh.top && sh.top.length) ws.getRow(1).font = { bold: true, size: 14 };
    });
    var buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  }
  // read the first sheet of an .xlsx or .csv into objects keyed by normalised header
  async function readSheet(file) {
    var rows = [];
    if (/\.csv$/i.test(file.name)) {
      var text = await file.text(), cur = [], f = '', q = false;
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
        else if (ch === '"') q = true;
        else if (ch === ',' || ch === ';') { cur.push(f); f = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(f); rows.push(cur); cur = []; f = ''; }
        else f += ch;
      }
      if (f || cur.length) { cur.push(f); rows.push(cur); }
    } else {
      var X = await loadExcel(), wb = new X.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      var ws = wb.worksheets[0];
      ws.eachRow({ includeEmpty: false }, function (r) {
        var a = []; r.eachCell({ includeEmpty: true }, function (c, n) {
          var v = c.value; if (v && typeof v === 'object') v = v.result != null ? v.result : v.text != null ? v.text : v.richText ? v.richText.map(function (t) { return t.text; }).join('') : String(v);
          a[n - 1] = v == null ? '' : String(v);
        }); rows.push(a);
      });
    }
    rows = rows.filter(function (r) { return r.some(function (c) { return String(c || '').trim(); }); });
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { if (h) o[h] = String(r[i] == null ? '' : r[i]).trim(); }); return o; });
  }
  function pick(o, names) { for (var i = 0; i < names.length; i++) if (o[names[i]] != null && o[names[i]] !== '') return o[names[i]]; return ''; }
  var PN_COLS = ['lucaspn', 'lucaspartnumber', 'lucaspartno', 'lpnumber', 'lpno', 'lp', 'partnumber', 'partno', 'pn', 'lucas'];
  function num(s) { if (s === '' || s == null) return null; var n = Number(String(s).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; }

  // ---------- screens and sign in ----------
  var SCREENS = ['login', 'setPass', 'noAccess', 'tab-inquiries', 'tab-parts', 'tab-prices', 'tab-lookup'];
  function show(id) { SCREENS.forEach(function (x) { $(x).hidden = x !== id; }); }
  function signedOutUi() { $('tabs').hidden = true; $('who').hidden = true; $('barTitle').hidden = false; }

  sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') { recovering = true; signedOutUi(); show('setPass'); } });

  async function boot() {
    try {
      if (recovering) return;
      var session = (await sb.auth.getSession()).data.session;
      if (!session) { signedOutUi(); show('login'); return; }
      EMAIL = session.user.email;
      var role = must(await sb.rpc('my_staff_role'));
      if (!role) { signedOutUi(); $('naEmail').textContent = EMAIL; show('noAccess'); return; }
      ROLE = role; document.body.classList.toggle('viewer', !isEditor());
      $('whoEmail').textContent = EMAIL; $('whoRole').textContent = isEditor() ? 'Data team · can edit' : 'View only';
      $('tabs').hidden = false; $('who').hidden = false; $('barTitle').hidden = true;
      CATS = must(await sb.from('categories').select('name,subcategory_key,group_name,view_name,status,sort_order').eq('status', 'live').order('sort_order'));
      var opts = CATS.map(function (c) { return '<option value="' + esc(c.subcategory_key) + '">' + esc(c.name) + '</option>'; }).join('');
      $('ptRange').innerHTML = opts; $('prTplRange').innerHTML = opts;
      var t = 'inquiries'; try { t = localStorage.getItem('lucasStaffTab') || t; } catch (e) {}
      openTab(t);
    } catch (e) { fail(e); signedOutUi(); show('login'); }
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault(); var m = $('lMsg'); m.className = 'msg'; m.textContent = 'Signing in…'; $('lBtn').disabled = true;
    var r = await sb.auth.signInWithPassword({ email: $('lEmail').value.trim(), password: $('lPass').value });
    $('lBtn').disabled = false;
    if (r.error) { m.className = 'msg err'; m.textContent = r.error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : r.error.message; return; }
    m.textContent = ''; $('lPass').value = ''; boot();
  });
  $('forgot').addEventListener('click', async function () {
    var em = $('lEmail').value.trim(), m = $('lMsg');
    if (!em) { m.className = 'msg err'; m.textContent = 'Type your email first.'; $('lEmail').focus(); return; }
    var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + '/admin/' });
    m.className = r.error ? 'msg err' : 'msg ok'; m.textContent = r.error ? r.error.message : 'If this email has a staff account, a reset link is on its way.';
  });
  $('setPassForm').addEventListener('submit', async function (e) {
    e.preventDefault(); var m = $('npMsg');
    if ($('np1').value !== $('np2').value) { m.className = 'msg err'; m.textContent = 'The two passwords are different.'; return; }
    var r = await sb.auth.updateUser({ password: $('np1').value });
    if (r.error) { m.className = 'msg err'; m.textContent = r.error.message; return; }
    recovering = false; history.replaceState(null, '', '/admin/'); toast('Password saved'); boot();
  });
  async function signOut() { await sb.auth.signOut(); ROLE = null; location.replace('/admin/'); }
  $('signOut').addEventListener('click', signOut); $('naOut').addEventListener('click', signOut);

  // ---------- tabs ----------
  var loaded = {};
  function openTab(t) {
    if (!$('tab-' + t)) t = 'inquiries';
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    show('tab-' + t); try { localStorage.setItem('lucasStaffTab', t); } catch (e) {}
    if (t === 'inquiries') loadInquiries();
    if (t === 'parts' && !loaded.parts) { loaded.parts = 1; loadParts(); }
    if (t === 'prices' && !loaded.prices) { loaded.prices = 1; loadCoverage(); }
    if (t === 'lookup') $('lkInput').focus();
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) openTab(b.dataset.tab); });

  // ---------- drawer ----------
  function drawer(html) { $('drawerBody').innerHTML = html; $('drawer').hidden = false; $('drawer').querySelector('.drawer-in').scrollTop = 0; }
  function closeDrawer() { $('drawer').hidden = true; $('drawerBody').innerHTML = ''; }
  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerBody').addEventListener('click', function (e) { var x = e.target.closest('.rows .x'); if (x && x.parentElement) x.parentElement.remove(); });
  $('drawer').addEventListener('click', function (e) { if (e.target === $('drawer')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });

  // =====================================================================
  // INQUIRIES
  // =====================================================================
  var iq = { page: 0 };
  async function loadInquiries(page) {
    if (page != null) iq.page = page;
    try {
      var q = sb.from('inquiry_summary').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(iq.page * PAGE, iq.page * PAGE + PAGE - 1);
      if ($('iqStatus').value) q = q.eq('status', $('iqStatus').value);
      var s = orSearch(['ref', 'company', 'name', 'email'], $('iqSearch').value); if (s) q = q.or(s);
      var res = await q; var rows = must(res);
      var t = $('iqTable');
      if (!rows.length) { t.innerHTML = '<tbody><tr><td class="empty">No inquiries yet. Requests sent from the website cart appear here.</td></tr></tbody>'; $('iqPager').innerHTML = ''; return; }
      t.innerHTML = '<thead><tr><th>Received</th><th>Inquiry no.</th><th>Company</th><th>Name</th><th>Country</th><th class="num">Lines</th><th class="num">Pieces</th><th class="num">Total FOB USD</th><th>Missing prices</th><th>Status</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr class="click" data-ref="' + esc(r.ref) + '"><td>' + esc(dt(r.created_at)) + '</td><td class="pn">' + esc(r.ref) + '</td><td>' + esc(r.company) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.country) +
            '</td><td class="num">' + r.lines + '</td><td class="num">' + r.pieces + '</td><td class="num">' + money(r.total_fob_usd) + '</td><td>' + (r.lines_flagged ? '<span class="flag">' + r.lines_flagged + ' line' + (r.lines_flagged > 1 ? 's' : '') + '</span>' : '') +
            '</td><td><span class="pill ' + esc(r.status) + '">' + esc(r.status) + '</span></td></tr>';
        }).join('') + '</tbody>';
      pager($('iqPager'), iq.page, res.count || rows.length, loadInquiries);
    } catch (e) { fail(e); }
  }
  var iqT; $('iqSearch').addEventListener('input', function () { clearTimeout(iqT); iqT = setTimeout(function () { loadInquiries(0); }, 300); });
  $('iqStatus').addEventListener('change', function () { loadInquiries(0); });
  $('iqReload').addEventListener('click', function () { loadInquiries(); });
  $('iqTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-ref]'); if (tr) openInquiry(tr.dataset.ref); });

  async function openInquiry(ref) {
    try {
      var res = await Promise.all([sb.from('inquiries').select('*').eq('ref', ref).single(), sb.from('inquiry_lines').select('*').eq('ref', ref).order('line')]);
      var h = must(res[0]), lines = must(res[1]);
      var total = lines.reduce(function (s, l) { return s + (Number(l.line_fob_usd) || 0); }, 0);
      var pcs = lines.reduce(function (s, l) { return s + l.qty; }, 0), flagged = lines.filter(function (l) { return l.flag; }).length;
      var st = ['New', 'Quoted', 'Won', 'Lost', 'Closed'];
      drawer('<h1>' + esc(h.ref) + ' <span class="pill ' + esc(h.status) + '">' + esc(h.status) + '</span></h1>' +
        '<p class="muted">Received ' + esc(dt(h.created_at)) + '</p>' +
        '<div class="dl">' + [['Name', h.name], ['Company', h.company], ['Email', h.email ? '<a href="mailto:' + esc(h.email) + '">' + esc(h.email) + '</a>' : ''], ['Phone', esc(h.phone)], ['Country', esc(h.country)], ['Customer type', esc(h.customer_type)]]
          .map(function (p, i) { return '<div><b>' + p[0] + '</b>' + (i < 2 ? esc(p[1]) : p[1]) + '</div>'; }).join('') + '</div>' +
        (h.message ? '<h3>Message</h3><p style="white-space:pre-wrap">' + esc(h.message) + '</p>' : '') +
        '<h3>Parts (' + lines.length + ' lines, ' + pcs + ' pcs)</h3>' +
        (flagged ? '<p class="flag">' + flagged + ' line' + (flagged > 1 ? 's need' : ' needs') + ' attention: see the last column.</p>' : '') +
        '<div class="tablewrap"><table class="grid"><thead><tr><th>#</th><th>Requested</th><th>Lucas PN</th><th>Description</th><th>Range</th><th class="num">Qty</th><th class="num">FOB USD</th><th class="num">Line FOB USD</th><th>Note</th></tr></thead><tbody>' +
        lines.map(function (l) {
          return '<tr><td>' + l.line + '</td><td>' + esc(l.requested_pn) + '</td><td class="pn">' + esc(l.lucas_pn || '') + '</td><td>' + esc(l.description) + '</td><td>' + esc(l.subcategory || '') +
            '</td><td class="num">' + l.qty + '</td><td class="num">' + money(l.fob_usd) + '</td><td class="num">' + money(l.line_fob_usd) + '</td><td>' + (l.flag ? '<span class="flag">' + esc(l.flag) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td colspan="5">Total' + (flagged ? ' (lines without a price are not included)' : '') + '</td><td class="num">' + pcs + '</td><td></td><td class="num">' + money(total) + '</td><td></td></tr></tfoot></table></div>' +
        '<div class="editor-only"><h3>Follow-up</h3><div class="form2"><label>Status<select id="dStatus">' + st.map(function (s) { return '<option' + (s === h.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label></div>' +
        '<label>Notes for the team<textarea id="dNotes">' + esc(h.staff_notes || '') + '</textarea></label></div>' +
        (!isEditor() && h.staff_notes ? '<h3>Notes</h3><p style="white-space:pre-wrap">' + esc(h.staff_notes) + '</p>' : '') +
        '<div class="actions"><button class="btn editor-only" id="dSave">Save</button><button class="btn ghost" id="dXls">Download Excel with prices</button></div>');
      $('dXls').onclick = function () {
        saveXlsx([{ name: 'Inquiry', widths: [4, 14, 12, 50, 14, 6, 10, 12, 22],
          top: [['Inquiry ' + h.ref], ['Received', dt(h.created_at)], ['Company', h.company || ''], ['Name', h.name || ''], ['Email', h.email || ''], ['Phone', h.phone || ''], ['Country', h.country || ''], []],
          head: ['#', 'Requested PN', 'Lucas PN', 'Description', 'Range', 'Qty', 'FOB USD', 'Line FOB USD', 'Note'],
          rows: lines.map(function (l) { return [l.line, l.requested_pn, l.lucas_pn || '', l.description || '', l.subcategory || '', l.qty, l.fob_usd == null ? '' : Number(l.fob_usd), l.line_fob_usd == null ? '' : Number(l.line_fob_usd), l.flag || '']; }),
          foot: [['', '', '', 'Total', '', pcs, '', Math.round(total * 100) / 100, '']] }], h.ref + '_FOB.xlsx').catch(fail);
      };
      if ($('dSave')) $('dSave').onclick = async function () {
        try { must(await sb.from('inquiries').update({ status: $('dStatus').value, staff_notes: $('dNotes').value }).eq('ref', h.ref)); toast('Saved'); loadInquiries(); openInquiry(h.ref); } catch (e) { fail(e); }
      };
    } catch (e) { fail(e); }
  }

  // =====================================================================
  // PARTS
  // =====================================================================
  var pt = { page: 0 };
  function curCat() { return CATS.find(function (c) { return c.subcategory_key === $('ptRange').value; }) || CATS[0]; }
  function searchCols(view) { return view === 'bulbs_full' ? ['lucas_pn', 'description', 'supplier_pn'] : ['lucas_pn', 'description', 'oe_numbers', 'competitor_numbers']; }
  function partsQuery(cat, opts) {
    var q = sb.from(cat.view_name).select('*', opts);
    if ($('ptStatus').value) q = q.eq('status', $('ptStatus').value);
    var s = orSearch(searchCols(cat.view_name), $('ptSearch').value); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }
  async function loadParts(page) {
    if (page != null) pt.page = page;
    var cat = curCat(); if (!cat) return;
    try {
      var res = await partsQuery(cat, { count: 'exact' }).range(pt.page * PAGE, pt.page * PAGE + PAGE - 1);
      var rows = must(res), t = $('ptTable');
      $('ptInfo').textContent = (res.count || 0).toLocaleString() + ' ' + cat.name.toLowerCase() + ($('ptSearch').value ? ' matching your search' : '') + '. Click a part to see everything about it' + (isEditor() ? ' or edit it.' : '.');
      if (!rows.length) { t.innerHTML = '<tbody><tr><td class="empty">No parts found.</td></tr></tbody>'; $('ptPager').innerHTML = ''; return; }
      var cols = Object.keys(rows[0]);
      // FOB first after the description: it is the price used for inquiries
      cols = cols.filter(function (k) { return k !== 'fob_usd'; }); cols.splice(2, 0, 'fob_usd');
      t.innerHTML = '<thead><tr>' + cols.map(function (k) { return '<th' + (NUMCOLS.test(k) || PCTCOLS.test(k) ? ' class="num"' : '') + '>' + esc(label(k)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr class="click" data-pn="' + esc(r.lucas_pn) + '">' + cols.map(function (k) { return cell(k, r[k]); }).join('') + '</tr>'; }).join('') + '</tbody>';
      pager($('ptPager'), pt.page, res.count || rows.length, loadParts);
    } catch (e) { fail(e); }
  }
  var ptT; $('ptSearch').addEventListener('input', function () { clearTimeout(ptT); ptT = setTimeout(function () { loadParts(0); }, 300); });
  $('ptRange').addEventListener('change', function () { loadParts(0); });
  $('ptStatus').addEventListener('change', function () { loadParts(0); });
  $('ptTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-pn]'); if (tr) openPart(tr.dataset.pn); });
  $('ptExport').addEventListener('click', async function () {
    var cat = curCat(); toast('Preparing ' + cat.name + '…');
    try {
      var rows = [], i = 0;
      for (;;) { var r = must(await partsQuery(cat).range(i, i + 999)); rows = rows.concat(r); if (r.length < 1000) break; i += 1000; }
      if (!rows.length) return toast('Nothing to export');
      var cols = Object.keys(rows[0]);
      await saveXlsx([{ name: cat.name.slice(0, 30), head: cols.map(label), rows: rows.map(function (r) { return cols.map(function (k) { var v = r[k]; return v == null ? '' : (NUMCOLS.test(k) || PCTCOLS.test(k)) ? Number(v) : v; }); }) }],
        'Lucas_' + cat.name.replace(/\s+/g, '_') + '.xlsx');
    } catch (e) { fail(e); }
  });

  // ---- one part ----
  var PRODUCT_FIELDS = [['short_desc', 'Description'], ['long_desc', 'Long description'], ['brand', 'Brand'], ['origin', 'Origin'], ['supplier_pn', 'Supplier PN'], ['zp_pn', 'ZP PN'], ['barcode', 'Barcode'], ['hs_code', 'HS code'], ['notes', 'Notes']];
  var PRICE_FIELDS = [['fob_usd', 'FOB USD'], ['exw_usd', 'EXW USD'], ['price_list', 'Price list']];
  var COST_FIELDS = [['pct_cons', 'Consolidation %'], ['pct_ship', 'Shipping %'], ['pct_ins', 'Insurance %'], ['pct_port', 'Port %'], ['pct_wh', 'Warehouse %'], ['min_retention', 'Min. retention %'], ['max_discount', 'Max. discount %']];
  var LIST_DEFS = {
    specs: { table: 'product_specs', cols: [['attribute', 'Attribute'], ['value', 'Value']], title: 'Specifications', req: 'attribute' },
    oe: { table: 'oe_numbers', cols: [['oe_number', 'OE number'], ['oe_brand', 'Vehicle brand']], title: 'OE numbers', req: 'oe_number' },
    comp: { table: 'competitor_refs', cols: [['comp_brand', 'Brand'], ['comp_number', 'Number']], title: 'Competitor numbers', req: 'comp_number' }
  };
  function inp(id, v, attrs) { return '<input id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (isEditor() ? '' : ' readonly') + (attrs || '') + '>'; }
  function rowsHtml(key, items) {
    var d = LIST_DEFS[key];
    return '<h3>' + d.title + ' <span class="muted small">(' + items.length + ')</span></h3><div class="rows" id="rows-' + key + '">' +
      items.map(function (it) { return rowHtml(key, it); }).join('') + '</div>' +
      '<button type="button" class="btn ghost small editor-only" data-add="' + key + '" style="margin-top:8px">+ Add</button>';
  }
  function rowHtml(key, it) {
    var d = LIST_DEFS[key];
    return '<div class="row" data-id="' + esc(it.id || '') + '">' + d.cols.map(function (c) {
      return '<input data-f="' + c[0] + '" placeholder="' + c[1] + '" value="' + esc(it[c[0]] == null ? '' : it[c[0]]) + '"' + (isEditor() ? '' : ' readonly') + '>';
    }).join('') + '<button type="button" class="x editor-only" title="Remove">×</button></div>';
  }
  function readRows(key) {
    var d = LIST_DEFS[key];
    return Array.from(document.querySelectorAll('#rows-' + key + ' .row')).map(function (r) {
      var o = { id: r.dataset.id ? Number(r.dataset.id) : null }; d.cols.forEach(function (c) { o[c[0]] = r.querySelector('[data-f="' + c[0] + '"]').value.trim(); }); return o;
    });
  }

  async function openPart(pn) {
    try {
      var r = await Promise.all([
        sb.from('products').select('*').eq('lucas_pn', pn).single(),
        sb.from('product_pricing').select('*').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_prices').select('cost_zenter,rp_cif,net_cif,margin').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_specs').select('*').eq('lucas_pn', pn).order('id'),
        sb.from('oe_numbers').select('*').eq('lucas_pn', pn).order('id'),
        sb.from('competitor_refs').select('*').eq('lucas_pn', pn).order('comp_brand'),
        sb.from('applications').select('*', { count: 'exact' }).eq('lucas_pn', pn).order('make').order('model').limit(300),
        sb.from('spec_bulbs').select('*').eq('lucas_pn', pn).maybeSingle()
      ]);
      var p = must(r[0]), pr = must(r[1]) || {}, calc = must(r[2]) || {}, specs = must(r[3]), oe = must(r[4]), comp = must(r[5]), apps = must(r[6]), appCount = r[6].count || apps.length, bulb = must(r[7]);
      var orig = { specs: specs, oe: oe, comp: comp };
      var bulbCols = bulb ? Object.keys(bulb).filter(function (k) { return k !== 'lucas_pn'; }) : [];
      drawer('<h1>' + esc(p.lucas_pn) + ' <span class="pill ' + (p.status === 'Active' ? 'Won' : 'Closed') + '">' + esc(p.status || '') + '</span></h1>' +
        '<p class="muted">' + esc(p.category) + ' › ' + esc(p.subcategory) + (p.updated_by ? ' · last changed ' + esc(dt(p.updated_at)) + ' by ' + esc(p.updated_by) : '') + '</p>' +
        '<h3>Part</h3><div class="form2">' + PRODUCT_FIELDS.map(function (f) { return '<label>' + f[1] + inp('p_' + f[0], p[f[0]]) + '</label>'; }).join('') + '</div>' +
        '<h3>Price</h3><div class="form2">' + PRICE_FIELDS.map(function (f) { return '<label>' + f[1] + inp('r_' + f[0], pr[f[0]], f[0] === 'price_list' ? '' : ' inputmode="decimal"') + '</label>'; }).join('') +
        '<label>Net CIF (calculated)<input readonly value="' + money(calc.net_cif) + '"></label><label>RP CIF (calculated)<input readonly value="' + money(calc.rp_cif) + '"></label></div>' +
        '<details><summary class="small muted" style="cursor:pointer;margin-top:8px">Cost model used for CIF (from EXW)</summary><div class="form2">' +
        COST_FIELDS.map(function (f) { return '<label>' + f[1] + inp('r_' + f[0], pr[f[0]] == null ? '' : Math.round(pr[f[0]] * 10000) / 100, ' inputmode="decimal"') + '</label>'; }).join('') + '</div></details>' +
        (bulb ? '<h3>Bulb specifications</h3><div class="form2">' + bulbCols.map(function (k) { return '<label>' + esc(label(k)) + inp('b_' + k, bulb[k]) + '</label>'; }).join('') + '</div>' : '') +
        rowsHtml('specs', specs) + rowsHtml('oe', oe) + rowsHtml('comp', comp) +
        '<h3>Vehicles <span class="muted small">(' + appCount + (appCount > apps.length ? ', first ' + apps.length + ' shown' : '') + ')</span></h3>' +
        '<div class="tablewrap" style="max-height:340px"><table class="grid" id="appsTable"><thead><tr><th>Make</th><th>Model</th><th>Variant</th><th>Engine</th><th>Fuel</th><th>Years</th><th>Position</th><th>Details</th><th class="editor-only"></th></tr></thead><tbody>' +
        apps.map(function (a) { return '<tr data-id="' + a.id + '"><td>' + esc(a.make) + '</td><td>' + esc(a.model) + '</td><td>' + esc(a.variant) + '</td><td>' + esc(a.engine_code) + '</td><td>' + esc(a.fuel) + '</td><td>' + esc(a.years) + '</td><td>' + esc(a.position) + '</td><td>' + esc(a.description) + '</td><td class="editor-only"><button class="link" data-delapp="' + a.id + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table></div>' +
        '<div class="editor-only"><div class="form2" id="newApp">' + [['make', 'Make'], ['model', 'Model'], ['variant', 'Variant'], ['engine_code', 'Engine'], ['years', 'Years'], ['position', 'Position'], ['description', 'Details']].map(function (f) { return '<label>' + f[1] + '<input data-f="' + f[0] + '"></label>'; }).join('') +
        '</div><button type="button" class="btn ghost small" id="addApp" style="margin-top:8px">+ Add vehicle</button></div>' +
        '<div class="actions editor-only"><button class="btn" id="pSave">Save changes</button>' +
        '<button class="btn danger" id="pToggle">' + (p.status === 'Active' ? 'Deactivate (hide from catalogue)' : 'Reactivate') + '</button></div>');

      document.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { var k = b.dataset.add; $('rows-' + k).insertAdjacentHTML('beforeend', rowHtml(k, {})); $('rows-' + k).lastElementChild.querySelector('input').focus(); }; });
      if (!isEditor()) return;

      $('addApp').onclick = async function () {
        var o = { lucas_pn: pn, source: 'manual' }, any = false;
        $('newApp').querySelectorAll('[data-f]').forEach(function (i) { var v = i.value.trim(); o[i.dataset.f] = v || null; if (v) any = true; });
        if (!any) return toast('Fill in at least the make');
        try { must(await sb.from('applications').insert(o)); toast('Vehicle added'); openPart(pn); } catch (e) { fail(e); }
      };
      $('appsTable').onclick = async function (e) {
        var b = e.target.closest('[data-delapp]'); if (!b || !confirm('Remove this vehicle from ' + pn + '?')) return;
        try { must(await sb.from('applications').delete().eq('id', Number(b.dataset.delapp))); b.closest('tr').remove(); toast('Vehicle removed'); } catch (e) { fail(e); }
      };
      $('pToggle').onclick = async function () {
        var to = p.status === 'Active' ? 'Inactive' : 'Active';
        if (!confirm((to === 'Inactive' ? 'Deactivate ' : 'Reactivate ') + pn + '?')) return;
        try { must(await sb.from('products').update({ status: to }).eq('lucas_pn', pn)); toast(pn + ' is now ' + to.toLowerCase()); loadParts(); openPart(pn); } catch (e) { fail(e); }
      };
      $('pSave').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Saving…';
        try {
          // part
          var up = {}; PRODUCT_FIELDS.forEach(function (f) { var v = $('p_' + f[0]).value.trim(); up[f[0]] = v === '' ? null : v; });
          if (!up.short_desc) throw new Error('Description is required');
          must(await sb.from('products').update(up).eq('lucas_pn', pn));
          // price
          var pv = { lucas_pn: pn }, priceTouched = !!r[1].data;
          PRICE_FIELDS.forEach(function (f) {
            var v = $('r_' + f[0]).value.trim();
            if (f[0] === 'price_list') { pv.price_list = v || null; } else { var n = num(v); if (Number.isNaN(n)) throw new Error(f[1] + ' must be a number'); pv[f[0]] = n; }
            if (v) priceTouched = true;
          });
          COST_FIELDS.forEach(function (f) { var v = $('r_' + f[0]).value.trim(); if (v !== '') { var n = num(v); if (Number.isNaN(n)) throw new Error(f[1] + ' must be a number'); pv[f[0]] = n / 100; } });
          if (priceTouched) must(await sb.from('product_pricing').upsert(pv, { onConflict: 'lucas_pn' }));
          // bulb specs
          if (bulb) { var bu = {}; bulbCols.forEach(function (k) { var v = $('b_' + k).value.trim(); bu[k] = v === '' ? null : (k === 'kelvin' ? Number(v) : v); }); must(await sb.from('spec_bulbs').update(bu).eq('lucas_pn', pn)); }
          // lists: update changed rows, delete removed ones, insert new ones
          for (var key in LIST_DEFS) {
            var d = LIST_DEFS[key], now = readRows(key);
            var keep = now.filter(function (x) { return x.id; }).map(function (x) { return x.id; });
            var gone = orig[key].filter(function (o) { return keep.indexOf(o.id) < 0; }).map(function (o) { return o.id; });
            if (gone.length) must(await sb.from(d.table).delete().in('id', gone));
            for (var i = 0; i < now.length; i++) {
              var x = now[i], row = { lucas_pn: pn }; d.cols.forEach(function (c) { row[c[0]] = x[c[0]] || null; });
              if (!row[d.req]) { if (x.id) must(await sb.from(d.table).delete().eq('id', x.id)); continue; }
              if (key === 'comp' && !row.comp_brand) row.comp_brand = 'Cross-reference';
              if (x.id) {
                var o = orig[key].find(function (z) { return z.id === x.id; }), changed = d.cols.some(function (c) { return (o[c[0]] || '') !== (row[c[0]] || ''); });
                if (changed) must(await sb.from(d.table).update(row).eq('id', x.id));
              } else must(await sb.from(d.table).insert(row));
            }
          }
          toast('Saved ' + pn); loadParts(); openPart(pn);
        } catch (e) { fail(e); btn.disabled = false; btn.textContent = 'Save changes'; }
      };
    } catch (e) { fail(e); }
  }

  // ---- add one part ----
  $('ptAdd').addEventListener('click', function () {
    var cat = curCat();
    drawer('<h1>Add a part</h1><p class="muted">After saving you can add its price, specifications, OE numbers and vehicles.</p><div class="form2">' +
      '<label>Lucas part number<input id="nPn" placeholder="e.g. LFOG0200"></label>' +
      '<label>Range<select id="nRange">' + CATS.map(function (c) { return '<option value="' + esc(c.subcategory_key) + '"' + (c === cat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label></div>' +
      '<label>Description<input id="nDesc"></label><div class="actions"><button class="btn" id="nSave">Create part</button></div>');
    $('nSave').onclick = async function () {
      var pn = clean($('nPn').value), c = CATS.find(function (x) { return x.subcategory_key === $('nRange').value; }), d = $('nDesc').value.trim();
      if (!pn || !d) return toast('Part number and description are required');
      try {
        var ex = must(await sb.from('products').select('lucas_pn').eq('lucas_pn', pn).maybeSingle());
        if (ex) { toast(pn + ' already exists'); return openPart(pn); }
        must(await sb.from('products').insert({ lucas_pn: pn, category: c.group_name, subcategory: c.subcategory_key, short_desc: d, status: 'Active', brand: 'Lucas' }));
        toast(pn + ' created'); $('ptRange').value = c.subcategory_key; loadParts(0); openPart(pn);
      } catch (e) { fail(e); }
    };
  });

  // ---- import parts from Excel ----
  $('ptImport').addEventListener('click', function () { $('ptFile').value = ''; $('ptFile').click(); });
  $('ptFile').addEventListener('change', async function () {
    var f = this.files[0]; if (!f) return;
    try {
      var raw = await readSheet(f), byKey = {}, bad = [];
      CATS.forEach(function (c) { byKey[c.subcategory_key.toLowerCase()] = c; byKey[c.name.toLowerCase()] = c; });
      var rows = raw.map(function (o, i) {
        var pn = clean(pick(o, PN_COLS)), rg = pick(o, ['range', 'subcategory', 'category', 'productrange']);
        return { line: i + 2, lucas_pn: pn, cat: rg ? byKey[rg.toLowerCase()] : null, rangeText: rg,
          short_desc: pick(o, ['description', 'shortdesc', 'desc', 'shortdescription']), status: pick(o, ['status']),
          brand: pick(o, ['brand']), origin: pick(o, ['origin', 'countryoforigin']), barcode: pick(o, ['barcode', 'ean']), notes: pick(o, ['notes', 'note', 'remarks']),
          supplier_pn: pick(o, ['supplierpn', 'supplierpartnumber']), hs_code: pick(o, ['hscode', 'hs']), oe: pick(o, ['oenumbers', 'oenumber', 'oe']) };
      }).filter(function (r) { return r.lucas_pn; });
      if (!rows.length) return toast('No rows with a Lucas PN column found');
      var existing = {};
      for (var ch of chunks(rows.map(function (r) { return r.lucas_pn; }), 300)) must(await sb.from('products').select('*').in('lucas_pn', ch)).forEach(function (p) { existing[p.lucas_pn] = p; });
      rows.forEach(function (r) {
        var ex = existing[r.lucas_pn];
        if (r.rangeText && !r.cat) bad.push('Row ' + r.line + ': range "' + r.rangeText + '" is not one of ' + CATS.map(function (c) { return c.name; }).join(', '));
        else if (!ex && !r.cat) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is new, so it needs a range');
        else if (!ex && !r.short_desc) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is new, so it needs a description');
        if (r.status && !/^(active|inactive)$/i.test(r.status)) bad.push('Row ' + r.line + ': status must be Active or Inactive');
      });
      var nNew = rows.filter(function (r) { return !existing[r.lucas_pn]; }).length;
      drawer('<h1>Import parts</h1><p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows, <b>' + nNew + '</b> new parts, <b>' + (rows.length - nNew) + '</b> updates to existing parts. Blank cells leave the current value unchanged.</p>' +
        (bad.length ? '<p class="flag">Fix these first (' + bad.length + '):</p><ul>' + bad.slice(0, 40).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        '<p class="muted small">Columns read: Lucas PN, Range, Description, Status, Brand, Origin, Barcode, Supplier PN, HS code, Notes, OE numbers (several separated by commas).</p>' +
        '<div class="actions"><button class="btn" id="impGo"' + (bad.length ? ' disabled' : '') + '>Import ' + rows.length + ' parts</button></div>');
      $('impGo').onclick = async function () {
        this.disabled = true; this.textContent = 'Importing…';
        try {
          var F = ['short_desc', 'status', 'brand', 'origin', 'barcode', 'notes', 'supplier_pn', 'hs_code'];
          var up = rows.map(function (r) {
            var ex = existing[r.lucas_pn] || {}, o = { lucas_pn: r.lucas_pn, category: r.cat ? r.cat.group_name : ex.category, subcategory: r.cat ? r.cat.subcategory_key : ex.subcategory };
            F.forEach(function (k) { var v = r[k]; if (k === 'status' && v) v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); o[k] = v !== '' ? v : (ex[k] != null ? ex[k] : (k === 'status' ? 'Active' : k === 'brand' ? 'Lucas' : null)); });
            return o;
          });
          for (var c of chunks(up, 500)) must(await sb.from('products').upsert(c, { onConflict: 'lucas_pn' }));
          var oe = []; rows.forEach(function (r) { r.oe.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) { oe.push({ lucas_pn: r.lucas_pn, oe_number: n }); }); });
          for (var c2 of chunks(oe, 500)) must(await sb.from('oe_numbers').upsert(c2, { onConflict: 'lucas_pn,oe_number', ignoreDuplicates: true }));
          toast('Imported ' + rows.length + ' parts' + (oe.length ? ' and ' + oe.length + ' OE numbers' : '')); closeDrawer(); loadParts(0);
        } catch (e) { fail(e); this.disabled = false; this.textContent = 'Try again'; }
      };
    } catch (e) { fail(e); }
  });

  // =====================================================================
  // PRICES
  // =====================================================================
  async function loadCoverage() {
    try {
      $('prCoverage').innerHTML = '<tbody><tr><td class="empty">Loading…</td></tr></tbody>';
      var res = await Promise.all([fetchAll('products', 'lucas_pn,subcategory,status'), fetchAll('product_pricing', 'lucas_pn,fob_usd,exw_usd')]);
      var price = {}; res[1].forEach(function (p) { price[p.lucas_pn] = p; });
      var by = {}; res[0].forEach(function (p) { if (p.status !== 'Active') return; var b = by[p.subcategory] = by[p.subcategory] || { n: 0, fob: 0, exw: 0 }; b.n++; var pr = price[p.lucas_pn]; if (pr && pr.fob_usd != null) b.fob++; if (pr && pr.exw_usd != null) b.exw++; });
      var tot = { n: 0, fob: 0, exw: 0 };
      $('prCoverage').innerHTML = '<thead><tr><th>Range</th><th class="num">Active parts</th><th class="num">With FOB price</th><th class="num">Missing FOB</th><th class="num">With EXW price</th></tr></thead><tbody>' +
        CATS.map(function (c) { var b = by[c.subcategory_key] || { n: 0, fob: 0, exw: 0 }; tot.n += b.n; tot.fob += b.fob; tot.exw += b.exw;
          return '<tr><td>' + esc(c.name) + '</td><td class="num">' + b.n.toLocaleString() + '</td><td class="num">' + b.fob.toLocaleString() + '</td><td class="num">' + (b.n - b.fob ? '<span class="flag">' + (b.n - b.fob).toLocaleString() + '</span>' : '0') + '</td><td class="num">' + b.exw.toLocaleString() + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + tot.n.toLocaleString() + '</td><td class="num">' + tot.fob.toLocaleString() + '</td><td class="num">' + (tot.n - tot.fob).toLocaleString() + '</td><td class="num">' + tot.exw.toLocaleString() + '</td></tr></tfoot>';
    } catch (e) { fail(e); }
  }
  $('prReload').addEventListener('click', loadCoverage);
  $('prTpl').addEventListener('click', async function () {
    var c = CATS.find(function (x) { return x.subcategory_key === $('prTplRange').value; });
    try {
      var res = await Promise.all([fetchAll('products', 'lucas_pn,short_desc,status', function (q) { return q.eq('subcategory', c.subcategory_key).order('lucas_pn'); }), fetchAll('product_pricing', 'lucas_pn,fob_usd,exw_usd,price_list')]);
      var pr = {}; res[1].forEach(function (p) { pr[p.lucas_pn] = p; });
      var rows = res[0].filter(function (p) { return p.status === 'Active' && (!$('prTplMissing').checked || !pr[p.lucas_pn] || pr[p.lucas_pn].fob_usd == null); });
      if (!rows.length) return toast('Every active ' + c.name.toLowerCase() + ' part already has an FOB price');
      await saveXlsx([{ name: 'Prices', widths: [12, 60, 14, 10, 10, 16], head: ['Lucas PN', 'Description', 'Range', 'FOB USD', 'EXW USD', 'Price list'],
        rows: rows.map(function (p) { var x = pr[p.lucas_pn] || {}; return [p.lucas_pn, p.short_desc, c.name, x.fob_usd == null ? '' : Number(x.fob_usd), x.exw_usd == null ? '' : Number(x.exw_usd), x.price_list || '']; }) }],
        'Lucas_prices_' + c.name.replace(/\s+/g, '_') + '.xlsx');
    } catch (e) { fail(e); }
  });
  $('prFile').addEventListener('change', async function () {
    var f = this.files[0], box = $('prPreview'); if (!f) return;
    box.innerHTML = '<p class="muted">Reading ' + esc(f.name) + '…</p>';
    try {
      var raw = await readSheet(f), bad = [];
      var rows = raw.map(function (o, i) {
        return { line: i + 2, lucas_pn: clean(pick(o, PN_COLS)), fob: num(pick(o, ['fobusd', 'fob', 'fobprice', 'fobpriceusd', 'fobusdprice'])),
          exw: num(pick(o, ['exwusd', 'exw', 'exwprice', 'exwpriceusd'])), list: pick(o, ['pricelist', 'pricelistname', 'list']) };
      }).filter(function (r) { return r.lucas_pn && (r.fob != null || r.exw != null || r.list); });
      if (!rows.length) { box.innerHTML = '<p class="flag">No rows with a Lucas PN and a price were found. The columns must be called "Lucas PN" and "FOB USD".</p>'; return; }
      rows.forEach(function (r) { if (Number.isNaN(r.fob) || Number.isNaN(r.exw)) bad.push('Row ' + r.line + ' (' + r.lucas_pn + '): price is not a number'); else if ((r.fob != null && r.fob < 0) || (r.exw != null && r.exw < 0)) bad.push('Row ' + r.line + ': negative price'); });
      var known = {}, cur = {}, pns = rows.map(function (r) { return r.lucas_pn; });
      for (var ch of chunks(pns, 300)) {
        must(await sb.from('products').select('lucas_pn,short_desc').in('lucas_pn', ch)).forEach(function (p) { known[p.lucas_pn] = p.short_desc; });
        must(await sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd,price_list').in('lucas_pn', ch)).forEach(function (p) { cur[p.lucas_pn] = p; });
      }
      var unknown = rows.filter(function (r) { return !(r.lucas_pn in known); });
      var ok = rows.filter(function (r) { return r.lucas_pn in known && !Number.isNaN(r.fob) && !Number.isNaN(r.exw); });
      var changed = ok.filter(function (r) { var c = cur[r.lucas_pn] || {}; return (r.fob != null && Number(c.fob_usd) !== r.fob) || (r.exw != null && Number(c.exw_usd) !== r.exw) || (r.list && r.list !== c.price_list); });
      box.innerHTML = '<p><b>' + rows.length + '</b> rows read: <b>' + changed.length + '</b> prices will change, ' + (ok.length - changed.length) + ' unchanged' + (unknown.length ? ', <span class="flag">' + unknown.length + ' part numbers not in the database (skipped)</span>' : '') + '.</p>' +
        (bad.length ? '<p class="flag">Fix these first:</p><ul>' + bad.slice(0, 30).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        (unknown.length ? '<p class="small muted">Not found: ' + esc(unknown.slice(0, 40).map(function (r) { return r.lucas_pn; }).join(', ')) + (unknown.length > 40 ? '…' : '') + '</p>' : '') +
        (changed.length ? '<div class="tablewrap" style="max-height:300px"><table class="grid"><thead><tr><th>Lucas PN</th><th>Description</th><th class="num">FOB now</th><th class="num">FOB new</th><th class="num">EXW now</th><th class="num">EXW new</th></tr></thead><tbody>' +
          changed.slice(0, 200).map(function (r) { var c = cur[r.lucas_pn] || {}; return '<tr><td class="pn">' + esc(r.lucas_pn) + '</td><td class="clip">' + esc(known[r.lucas_pn]) + '</td><td class="num">' + money(c.fob_usd) + '</td><td class="num"><b>' + (r.fob == null ? money(c.fob_usd) : money(r.fob)) + '</b></td><td class="num">' + money(c.exw_usd) + '</td><td class="num">' + (r.exw == null ? money(c.exw_usd) : money(r.exw)) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '') +
        '<div class="actions"><button class="btn" id="prApply"' + (bad.length || !changed.length ? ' disabled' : '') + '>Update ' + changed.length + ' prices</button></div>';
      if ($('prApply')) $('prApply').onclick = async function () {
        this.disabled = true; this.textContent = 'Updating…';
        try {
          var up = changed.map(function (r) { var c = cur[r.lucas_pn] || {};
            return { lucas_pn: r.lucas_pn, fob_usd: r.fob != null ? r.fob : (c.fob_usd != null ? c.fob_usd : null), exw_usd: r.exw != null ? r.exw : (c.exw_usd != null ? c.exw_usd : null), price_list: r.list || c.price_list || null }; });
          for (var c of chunks(up, 500)) must(await sb.from('product_pricing').upsert(c, { onConflict: 'lucas_pn' }));
          box.innerHTML = '<p class="msg ok">Updated ' + up.length + ' prices.</p>'; $('prFile').value = ''; loadCoverage(); toast('Prices updated');
        } catch (e) { fail(e); this.disabled = false; this.textContent = 'Try again'; }
      };
    } catch (e) { fail(e); box.innerHTML = ''; }
  });

  // =====================================================================
  // NUMBER LOOKUP
  // =====================================================================
  async function lookup() {
    var terms = $('lkInput').value.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 200);
    var t = $('lkTable'); if (!terms.length) { t.innerHTML = ''; return; }
    try {
      var keys = terms.map(clean).filter(Boolean);
      var res = await Promise.all([sb.from('number_lookup').select('*').in('clean_key', keys).limit(2000), sb.from('products').select('lucas_pn').in('lucas_pn', keys)]);
      var hits = must(res[0]), direct = must(res[1]);
      var pns = Array.from(new Set(hits.map(function (h) { return h.lucas_pn; }).concat(direct.map(function (d) { return d.lucas_pn; }))));
      var info = {}, price = {};
      if (pns.length) {
        var r2 = await Promise.all([sb.from('products').select('lucas_pn,short_desc,subcategory,status').in('lucas_pn', pns), sb.from('product_pricing').select('lucas_pn,fob_usd').in('lucas_pn', pns)]);
        must(r2[0]).forEach(function (p) { info[p.lucas_pn] = p; }); must(r2[1]).forEach(function (p) { price[p.lucas_pn] = p.fob_usd; });
      }
      var out = [];
      terms.forEach(function (term) {
        var k = clean(term), found = [];
        direct.filter(function (d) { return d.lucas_pn === k; }).forEach(function (d) { found.push({ how: 'Lucas part number', pn: d.lucas_pn }); });
        hits.filter(function (h) { return h.clean_key === k; }).forEach(function (h) { found.push({ how: (h.source === 'OE' ? 'OE' : 'Competitor') + (h.brand ? ' · ' + h.brand : '') + ' ' + h.number, pn: h.lucas_pn }); });
        if (!found.length) out.push('<tr><td>' + esc(term) + '</td><td colspan="6" class="flag">Not found</td></tr>');
        found.forEach(function (f) { var p = info[f.pn] || {};
          out.push('<tr class="click" data-pn="' + esc(f.pn) + '"><td>' + esc(term) + '</td><td>' + esc(f.how) + '</td><td class="pn">' + esc(f.pn) + '</td><td>' + esc(p.short_desc) + '</td><td>' + esc(p.subcategory) + '</td><td>' + esc(p.status) + '</td><td class="num">' + money(price[f.pn]) + '</td></tr>'); });
      });
      t.innerHTML = '<thead><tr><th>Searched</th><th>Matched as</th><th>Lucas PN</th><th>Description</th><th>Range</th><th>Status</th><th class="num">FOB USD</th></tr></thead><tbody>' + out.join('') + '</tbody>';
    } catch (e) { fail(e); }
  }
  $('lkGo').addEventListener('click', lookup);
  $('lkInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  $('lkTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-pn]'); if (tr) openPart(tr.dataset.pn); });

  // give the URL a moment to be read (password reset links), then start
  setTimeout(boot, 50);
})();
