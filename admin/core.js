/* Lucas staff site: shared core (sign in, helpers, Excel, list parsing, bulk number matching).
   Data lives in the Supabase "Master Data" project. Access is enforced by the database (row level security):
   "editor" (data team) can change data, "viewer" (product, sales) can only read and download.
   The key below is the public (anon) key: on its own it cannot read anything. */
window.LS = (function () {
  'use strict';
  var SB_URL = 'https://kyegujgvlsbttyrlibgn.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZWd1amd2bHNidHR5cmxpYmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNTQ4NjUsImV4cCI6MjEwNjgzMDg2NX0.qw8n7Y9l8zO-npZ4BDlqK9PvksRQpEVg6BxqEo_MnWs';
  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  var L = { sb: sb, PAGE: 100, ROLE: null, EMAIL: '', CATS: [], modules: {} };

  // ---------- helpers ----------
  var $ = L.$ = function (id) { return document.getElementById(id); };
  L.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  L.clean = function (s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  L.isEditor = function () { return L.ROLE === 'editor'; };
  L.money = function (v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  L.qty = function (v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  L.dt = function (v) { if (!v) return ''; var d = new Date(v); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  L.label = function (k) {
    return ({ lucas_pn: 'Lucas PN', fob_usd: 'FOB USD', exw_usd: 'EXW USD', rp_cif: 'RP CIF', net_cif: 'Net CIF', cost_zenter: 'Cost Zenter', oe_numbers: 'OE numbers', hs_code: 'HS code', current_a: 'Current', supplier_pn: 'Supplier PN', zp_pn: 'ZP PN', units_per_box: 'Units / box', units_per_carton: 'Units / carton' })[k] ||
      (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ').replace(/ dia$/, ' Ø'));
  };
  L.NUMCOLS = /^(fob_usd|exw_usd|cost_zenter|rp_cif|net_cif|vehicle_count|units_per_box|units_per_carton|net_weight_kg|gross_weight_kg|on_hand|reserved|available)$/;
  L.PCTCOLS = /^(margin|markup)$/;
  L.cell = function (k, v) {
    if (v == null) return '<td></td>';
    if (L.NUMCOLS.test(k)) return '<td class="num">' + (/usd|cif|cost/.test(k) ? L.money(v) : L.esc(L.qty(v))) + '</td>';
    if (L.PCTCOLS.test(k)) return '<td class="num">' + (Number(v) * 100).toFixed(1) + '%</td>';
    if (k === 'lucas_pn') return '<td class="pn">' + L.esc(v) + '</td>';
    var s = String(v); return '<td class="clip" title="' + L.esc(s.length > 60 ? s : '') + '">' + L.esc(s) + '</td>';
  };
  var toastT;
  L.toast = function (m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3800); };
  L.fail = function (e) { console.error(e); L.toast('Something went wrong: ' + (e && (e.message || e.details) || e)); };
  L.must = function (res) { if (res.error) throw res.error; return res.data; };
  L.pager = function (el, page, count, go) {
    var pages = Math.max(1, Math.ceil(count / L.PAGE));
    el.innerHTML = '<button class="btn ghost small" ' + (page <= 0 ? 'disabled' : '') + ' data-p="-1">‹ Previous</button>' +
      '<span>Page ' + (page + 1) + ' of ' + pages + ' · ' + count.toLocaleString() + ' rows</span>' +
      '<button class="btn ghost small" ' + (page >= pages - 1 ? 'disabled' : '') + ' data-p="1">Next ›</button>';
    el.onclick = function (e) { var b = e.target.closest('button[data-p]'); if (b && !b.disabled) go(page + Number(b.dataset.p)); };
  };
  // all rows of a query (the API returns at most 1,000 rows per request)
  L.fetchAll = async function (make) {
    var out = [], i = 0;
    for (;;) { var rows = L.must(await make().range(i, i + 999)); out = out.concat(rows); if (rows.length < 1000) return out; i += 1000; }
  };
  L.chunks = function (a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  L.orSearch = function (cols, text) {
    var s = String(text || '').replace(/[,()*%\\"]/g, ' ').trim(); if (!s) return null;
    return cols.map(function (c) { return c + '.ilike.*' + s + '*'; }).join(',');
  };
  L.num = function (s) { if (s === '' || s == null) return null; var n = Number(String(s).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; };
  L.rangeOptions = function (withAll) {
    return (withAll ? '<option value="">All ranges</option>' : '') + L.CATS.map(function (c) { return '<option value="' + L.esc(c.subcategory_key) + '">' + L.esc(c.name) + '</option>'; }).join('');
  };
  L.debounce = function (fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms || 300); }; };

  // ---------- Excel (ExcelJS is self-hosted for the cart already) ----------
  var excelP;
  L.loadExcel = function () {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!excelP) excelP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '/assets/vendor-exceljs.min.js';
      s.onload = function () { res(window.ExcelJS); }; s.onerror = function () { rej(new Error('Excel library did not load')); };
      document.head.appendChild(s);
    });
    return excelP;
  };
  L.download = function (blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  // sheets: [{name, head:[...], rows:[[...]], top:[[...]], foot:[[...]], widths:[...]}]
  L.saveXlsx = async function (sheets, name) {
    var X = await L.loadExcel(), wb = new X.Workbook();
    sheets.forEach(function (sh) {
      var ws = wb.addWorksheet(String(sh.name).slice(0, 30));
      (sh.top || []).forEach(function (r) { ws.addRow(r); });
      var hr = ws.addRow(sh.head); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hr.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00954C' } }; });
      sh.rows.forEach(function (r) { ws.addRow(r); });
      (sh.foot || []).forEach(function (r) { ws.addRow(r).font = { bold: true }; });
      sh.head.forEach(function (h, i) { ws.getColumn(i + 1).width = Math.min(60, Math.max(10, String(h).length + 4, (sh.widths || [])[i] || 0)); });
      if (sh.top && sh.top.length) ws.getRow(1).font = { bold: true, size: 14 };
      ws.views = [{ state: 'frozen', ySplit: (sh.top || []).length + 1 }];
    });
    var buf = await wb.xlsx.writeBuffer();
    L.download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  };
  // first sheet of an .xlsx / .csv as an array of rows (arrays of strings)
  L.readRows = async function (file) {
    var rows = [];
    if (/\.csv$|\.txt$/i.test(file.name)) {
      var text = await file.text(), cur = [], f = '', q = false;
      var delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      if (text.split('\n')[0].indexOf('\t') >= 0) delim = '\t';
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
        else if (ch === '"') q = true;
        else if (ch === delim) { cur.push(f); f = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(f); rows.push(cur); cur = []; f = ''; }
        else f += ch;
      }
      if (f || cur.length) { cur.push(f); rows.push(cur); }
    } else {
      var X = await L.loadExcel(), wb = new X.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      var ws = wb.worksheets[0];
      ws.eachRow({ includeEmpty: false }, function (r) {
        var a = []; r.eachCell({ includeEmpty: true }, function (c, n) {
          var v = c.value;
          if (v && typeof v === 'object') v = v.result != null ? v.result : v.text != null ? v.text : v.richText ? v.richText.map(function (t) { return t.text; }).join('') : String(v);
          a[n - 1] = v == null ? '' : String(v);
        });
        for (var k = 0; k < a.length; k++) if (a[k] == null) a[k] = '';
        rows.push(a);
      });
    }
    return rows.filter(function (r) { return r.some(function (c) { return String(c || '').trim(); }); });
  };
  L.normHead = function (h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  // rows as objects keyed by normalised heading
  L.readSheet = async function (file) {
    var rows = await L.readRows(file); if (!rows.length) return [];
    var head = rows[0].map(L.normHead);
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { if (h) o[h] = String(r[i] == null ? '' : r[i]).trim(); }); return o; });
  };
  L.pick = function (o, names) { for (var i = 0; i < names.length; i++) if (o[names[i]] != null && o[names[i]] !== '') return o[names[i]]; return ''; };
  L.PN_COLS = ['lucaspn', 'lucaspartnumber', 'lucaspartno', 'lpnumber', 'lpno', 'lp', 'partnumber', 'partno', 'pn', 'lucas'];

  // ---------- customer lists: numbers with optional quantity ----------
  var isQty = function (s) { return /^\d{1,6}([.,]0+)?$/.test(String(s).trim()); };
  // pasted text: one number per line; "number<TAB|;|,>qty" keeps the quantity; "a, b, c" on one line = three numbers
  L.parseListText = function (text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var parts = line.split(/\t|;|,/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (parts.length >= 2 && isQty(parts[parts.length - 1]) && !isQty(parts[0])) {
        out.push({ no: parts.slice(0, -1).join(' '), qty: parseInt(parts[parts.length - 1], 10) || 1 });
      } else parts.forEach(function (p) { out.push({ no: p, qty: 1 }); });
    });
    return out;
  };
  var NUM_HEADS = /^(lucaspn|oe|oenumber|oenumbers|oeno|oem|oemnumber|oemno|partnumber|partno|pn|number|no|reference|ref|refno|item|itemno|code|articleno|article|crossreference|competitornumber|lucas)$/;
  var NUM_HEADS_LOOSE = /(oe|oem|part|number|ref|code|article|item)/;
  var QTY_HEADS = /^(qty|quantity|qnty|pcs|pieces|units|orderqty|requiredqty|qtyrequired)$/;
  var DESC_HEADS = /^(description|desc|partname|name|item description|itemdescription)$/;
  // uploaded list: finds the number / quantity / description columns by their headings
  L.parseListFile = async function (file) {
    var rows = await L.readRows(file); if (!rows.length) return { items: [], info: 'The file is empty.' };
    var head = rows[0].map(L.normHead), ni = -1, qi = -1, di = -1;
    head.forEach(function (h, i) { if (ni < 0 && NUM_HEADS.test(h)) ni = i; if (qi < 0 && QTY_HEADS.test(h)) qi = i; if (di < 0 && DESC_HEADS.test(h)) di = i; });
    if (ni < 0) head.forEach(function (h, i) { if (ni < 0 && i !== qi && NUM_HEADS_LOOSE.test(h)) ni = i; });
    var hasHead = ni >= 0 || qi >= 0;
    if (ni < 0) ni = 0;
    var body = hasHead ? rows.slice(1) : rows, items = [];
    body.forEach(function (r) {
      var no = String(r[ni] == null ? '' : r[ni]).trim(); if (!no) return;
      var q = qi >= 0 ? parseInt(String(r[qi]).replace(/[^\d]/g, ''), 10) : NaN;
      items.push({ no: no, qty: q > 0 ? q : 1, desc: di >= 0 ? String(r[di] || '').trim() : '' });
    });
    var info = items.length + ' numbers read from column "' + (hasHead ? rows[0][ni] : 'first column') + '"' + (qi >= 0 ? ', quantities from "' + rows[0][qi] + '"' : ', quantity 1 each (no quantity column found)') + '.';
    return { items: items, info: info };
  };

  // ---------- bulk matching: Lucas / OE / competitor numbers -> Lucas parts ----------
  // returns one row per (input position, matched part); "Not found" rows have no part. onProgress(done, total)
  L.lookupNumbers = async function (terms, onProgress) {
    var parts = L.chunks(terms, 250), out = new Array(parts.length), done = 0, next = 0;
    async function worker() {
      while (next < parts.length) {
        var i = next++;
        var rows = L.must(await sb.rpc('lookup_numbers', { terms: parts[i] }));
        rows.forEach(function (r) { r.ord = r.ord + i * 250; });
        out[i] = rows; done += parts[i].length; if (onProgress) onProgress(done, terms.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return [].concat.apply([], out);
  };

  // ---------- drawer ----------
  L.drawer = function (html) { $('drawerBody').innerHTML = html; $('drawer').hidden = false; $('drawer').querySelector('.drawer-in').scrollTop = 0; };
  L.closeDrawer = function () { $('drawer').hidden = true; $('drawerBody').innerHTML = ''; };
  $('drawerClose').addEventListener('click', L.closeDrawer);
  $('drawerBody').addEventListener('click', function (e) { var x = e.target.closest('.rows .x'); if (x && x.parentElement) x.parentElement.remove(); });
  $('drawer').addEventListener('click', function (e) { if (e.target === $('drawer')) L.closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) L.closeDrawer(); });
  // pick a file through the shared hidden input
  L.pickFile = function (cb) { var f = $('hiddenFile'); f.value = ''; f.onchange = function () { if (f.files[0]) cb(f.files[0]); }; f.click(); };

  // ---------- screens, sign in, tabs ----------
  var TABS = ['inquiries', 'lookup', 'parts', 'partno', 'barcodes', 'inventory'];
  var SCREENS = ['login', 'setPass', 'noAccess'].concat(TABS.map(function (t) { return 'tab-' + t; }));
  var recovering = false, opened = {};
  function show(id) { SCREENS.forEach(function (x) { $(x).hidden = x !== id; }); }
  function signedOutUi() { $('tabs').hidden = true; $('who').hidden = true; $('barTitle').hidden = false; }
  L.openTab = function (t) {
    if (TABS.indexOf(t) < 0) t = 'inquiries';
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    show('tab-' + t); try { localStorage.setItem('lucasStaffTab', t); } catch (e) {}
    var m = L.modules[t]; if (!m) return;
    if (!opened[t]) { opened[t] = 1; if (m.init) m.init(); } else if (m.show) m.show();
  };

  sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') { recovering = true; signedOutUi(); show('setPass'); } });

  async function boot() {
    try {
      if (recovering) return;
      var session = (await sb.auth.getSession()).data.session;
      if (!session) { signedOutUi(); show('login'); return; }
      L.EMAIL = session.user.email;
      var role = L.must(await sb.rpc('my_staff_role'));
      if (!role) { signedOutUi(); $('naEmail').textContent = L.EMAIL; show('noAccess'); return; }
      L.ROLE = role; document.body.classList.toggle('viewer', !L.isEditor());
      $('whoEmail').textContent = L.EMAIL; $('whoRole').textContent = L.isEditor() ? 'Data team · can edit' : 'View only';
      $('tabs').hidden = false; $('who').hidden = false; $('barTitle').hidden = true;
      L.CATS = L.must(await sb.from('categories').select('name,subcategory_key,group_name,view_name,status,sort_order').eq('status', 'live').order('sort_order'));
      var t = 'inquiries'; try { t = localStorage.getItem('lucasStaffTab') || t; } catch (e) {}
      L.openTab(t);
    } catch (e) { L.fail(e); signedOutUi(); show('login'); }
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
    recovering = false; history.replaceState(null, '', '/admin/'); L.toast('Password saved'); boot();
  });
  async function signOut() { await sb.auth.signOut(); L.ROLE = null; location.replace('/admin/'); }
  $('signOut').addEventListener('click', signOut); $('naOut').addEventListener('click', signOut);
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) L.openTab(b.dataset.tab); });

  // small UI pieces shared by modules
  L.chip = function (text, cls, data) { return '<button type="button" class="chip ' + (cls || '') + '"' + (data ? ' data-f="' + L.esc(data) + '"' : '') + '>' + text + '</button>'; };

  L.start = function () { setTimeout(boot, 50); };   // let the URL be read first (password reset links)
  return L;
})();
