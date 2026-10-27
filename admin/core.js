/* Lucas staff site: shared core.
   Odoo-style shell: app launcher, per-app menu bar, control panel (breadcrumbs, buttons, search with filters, pager),
   list and form views, modal wizards, hash routing (back / forward work).
   Data lives in the Supabase "Master Data" project. Access is enforced by the database (row level security):
   "editor" (data team) changes data, "viewer" (product, sales) reads and downloads.
   The key below is the public (anon) key: on its own it cannot read anything. */
window.LS = (function () {
  'use strict';
  var SB_URL = 'https://kyegujgvlsbttyrlibgn.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZWd1amd2bHNidHR5cmxpYmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNTQ4NjUsImV4cCI6MjEwNjgzMDg2NX0.qw8n7Y9l8zO-npZ4BDlqK9PvksRQpEVg6BxqEo_MnWs';
  // invitation and password-reset links arrive as #access_token=…&type=invite|recovery: read it before the client consumes it
  var LINK_TYPE = (/[#&]type=(invite|recovery|signup)/.exec(location.hash) || [])[1] || null;
  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  var L = { sb: sb, PAGE: 80, ROLE: null, EMAIL: '', CATS: [], apps: [], state: {} };

  // =====================================================================
  // helpers
  // =====================================================================
  var $ = L.$ = function (id) { return document.getElementById(id); };
  var esc = L.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  L.clean = function (s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  L.isEditor = function () { return L.ROLE === 'editor'; };
  L.money = function (v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  L.qty = function (v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  L.dt = function (v) { if (!v) return ''; var d = new Date(v); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  L.label = function (k) {
    return ({ lucas_pn: 'Lucas PN', fob_usd: 'FOB USD', exw_usd: 'EXW USD', rp_cif: 'RP CIF', net_cif: 'Net CIF', cost_zenter: 'Cost Zenter', oe_numbers: 'OE numbers', hs_code: 'HS code', current_a: 'Current', supplier_pn: 'Supplier PN', zp_pn: 'ZP PN', units_per_box: 'Units / box', units_per_carton: 'Units / carton',
      landed_cost: 'Landed cost USD', sales_price: 'Sales price USD', moq: 'MOQ', price_source: 'Price source', price_east_africa: 'East Africa USD', price_central_africa: 'Central Africa USD', price_west_africa: 'West Africa USD',
      price_southern_africa: 'Southern Africa USD', price_middle_east: 'Middle East USD', price_north_africa: 'North Africa USD', price_ocean_islands: 'Ocean Islands USD', price_gcc: 'GCC USD' })[k] ||
      (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ').replace(/ dia$/, ' Ø'));
  };
  L.NUMCOLS = /^(fob_usd|exw_usd|cost_zenter|rp_cif|net_cif|vehicle_count|units_per_box|units_per_carton|net_weight_kg|gross_weight_kg|on_hand|reserved|available|landed_cost|sales_price|moq|price_(east_africa|central_africa|west_africa|southern_africa|middle_east|north_africa|ocean_islands|gcc))$/;
  L.PCTCOLS = /^(margin|markup)$/;
  L.cell = function (k, v) {
    if (v == null) return '<td></td>';
    if (L.NUMCOLS.test(k)) return '<td class="num">' + (/usd|cif|cost|price/.test(k) ? L.money(v) : esc(L.qty(v))) + '</td>';
    if (L.PCTCOLS.test(k)) return '<td class="num">' + (Number(v) * 100).toFixed(1) + '%</td>';
    if (k === 'lucas_pn') return '<td class="pn">' + esc(v) + '</td>';
    var s = String(v); return '<td class="clip" title="' + esc(s.length > 60 ? s : '') + '">' + esc(s) + '</td>';
  };
  var toastT;
  L.toast = function (m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3800); };
  L.fail = function (e) { console.error(e); L.toast('Something went wrong: ' + (e && (e.message || e.details) || e)); };
  L.must = function (res) { if (res.error) throw res.error; return res.data; };
  L.fetchAll = async function (make) {   // all rows (the API returns at most 1,000 per request)
    var out = [], i = 0;
    for (;;) { var rows = L.must(await make().range(i, i + 999)); out = out.concat(rows); if (rows.length < 1000) return out; i += 1000; }
  };
  L.chunks = function (a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  L.orSearch = function (cols, text) {
    var s = String(text || '').replace(/[,()*%\\"]/g, ' ').trim(); if (!s) return null;
    return cols.map(function (c) { return c + '.ilike.*' + s + '*'; }).join(',');
  };
  L.num = function (s) { if (s === '' || s == null) return null; var n = Number(String(s).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; };
  L.debounce = function (fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms || 300); }; };
  L.today = function () { return new Date().toISOString().slice(0, 10); };
  L.cat = function (key) { return L.CATS.find(function (c) { return c.subcategory_key === key; }); };
  L.rangeOptions = function (withAll, sel) {
    return (withAll ? '<option value="">All ranges</option>' : '') + L.CATS.map(function (c) { return '<option value="' + esc(c.subcategory_key) + '"' + (c.subcategory_key === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  };
  L.chip = function (text, cls, data) { return '<button type="button" class="chip ' + (cls || '') + '"' + (data != null ? ' data-f="' + esc(data) + '"' : '') + '>' + text + '</button>'; };
  L.pill = function (text, cls) { return '<span class="pill ' + esc(cls || text) + '">' + esc(text) + '</span>'; };
  L.empty = function (title, text) { return '<div class="o-empty"><div class="o-empty-icon">∅</div><h2>' + esc(title) + '</h2>' + (text ? '<p>' + text + '</p>' : '') + '</div>'; };

  // =====================================================================
  // Excel and customer lists
  // =====================================================================
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
  L.saveXlsx = async function (sheets, name) {   // [{name, head, rows, top, foot, widths}]
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
  L.readRows = async function (file) {   // first sheet of .xlsx / .csv as arrays of strings
    var rows = [];
    if (/\.csv$|\.txt$/i.test(file.name)) {
      var text = await file.text(), cur = [], f = '', q = false, first = text.split('\n')[0];
      var delim = first.indexOf('\t') >= 0 ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
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
      wb.worksheets[0].eachRow({ includeEmpty: false }, function (r) {
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
  L.readSheet = async function (file) {   // objects keyed by normalised heading
    var rows = await L.readRows(file); if (!rows.length) return [];
    var head = rows[0].map(L.normHead);
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { if (h) o[h] = String(r[i] == null ? '' : r[i]).trim(); }); return o; });
  };
  L.pick = function (o, names) { for (var i = 0; i < names.length; i++) if (o[names[i]] != null && o[names[i]] !== '') return o[names[i]]; return ''; };
  L.PN_COLS = ['lucaspn', 'lucaspartnumber', 'lucaspartno', 'lpnumber', 'lpno', 'lp', 'partnumber', 'partno', 'pn', 'lucas'];
  var isQty = function (s) { return /^\d{1,6}([.,]0+)?$/.test(String(s).trim()); };
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = L.clean(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }
  // pasted text, one row per line:
  //   "number"                         a single number
  //   "number ; qty"  or "number<TAB>qty"   keeps the quantity
  //   "OE | reference ; qty" or tab-separated columns: several numbers for the same row (any of them may match)
  //   "a, b, c"                        three separate rows
  L.parseListText = function (text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var qty = 1, m = /(?:;|\t|,)\s*(\d{1,6})(?:[.,]0+)?\s*$/.exec(line);
      if (m && line.slice(0, m.index).trim() && !isQty(line.slice(0, m.index).trim())) { qty = parseInt(m[1], 10) || 1; line = line.slice(0, m.index).trim(); }
      if (/\||\t/.test(line)) {
        var alts = uniq(line.split(/\||\t/).map(function (x) { return x.trim(); }).filter(Boolean));
        if (alts.length) out.push({ no: alts[0], alts: alts, cols: [], qty: qty });
        return;
      }
      line.split(/;|,/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (p) { out.push({ no: p, alts: [p], cols: [], qty: qty }); });
    });
    return out;
  };
  L.listToText = function (items) { return items.map(function (i) { return i.alts.join(' | ') + (i.qty > 1 ? ' ; ' + i.qty : ''); }).join('\n'); };
  var NUM_HEADS = /^(lucaspn|lucas|lucaspartnumber|oe|oes|oenumber|oenumbers|oeno|oeref|oereference|oem|oemnumber|oemno|oempartnumber|partnumber|partno|pn|number|no|reference|references|ref|refno|refnumber|item|itemno|itemcode|code|productcode|articleno|articlenumber|article|crossreference|crossref|xref|competitornumber|competitor|manufacturerpartnumber|mpn|supplierpn|aftermarket|interchange|alternative|alternate|altpn)$/;
  var NUM_HEADS_LOOSE = /(oe|oem|part|number|ref|code|article|item|cross|interchange|competitor|mpn)/;
  var QTY_HEADS = /^(qty|quantity|qnty|qtty|pcs|pieces|units|orderqty|requiredqty|qtyrequired|reqqty|orderquantity)$/;
  var DESC_HEADS = /^(description|desc|partname|name|itemdescription|productname|application|vehicle|make|model|remarks|notes|brand)$/;
  // uploaded list: every column that holds part numbers is used (OE, Reference, Article no., ...);
  // quantity and description columns are recognised by their headings
  L.parseListFile = async function (file) {
    var rows = await L.readRows(file); if (!rows.length) return { items: [], info: 'The file is empty.' };
    var head = rows[0].map(L.normHead), qi = -1, di = -1, cols = [];
    head.forEach(function (h, i) { if (qi < 0 && QTY_HEADS.test(h)) qi = i; else if (di < 0 && /^(description|desc|partname|itemdescription|productname)$/.test(h)) di = i; });
    head.forEach(function (h, i) { if (i !== qi && i !== di && h && NUM_HEADS.test(h)) cols.push(i); });
    if (!cols.length) head.forEach(function (h, i) { if (i !== qi && i !== di && h && !DESC_HEADS.test(h) && NUM_HEADS_LOOSE.test(h)) cols.push(i); });
    var hasHead = cols.length > 0 || qi >= 0;
    if (!cols.length) cols = [0];
    var names = cols.map(function (i) { return hasHead ? String(rows[0][i] || '').trim() : ''; });
    var items = [];
    (hasHead ? rows.slice(1) : rows).forEach(function (r) {
      var vals = [], cn = [];
      cols.forEach(function (ci, k) {
        String(r[ci] == null ? '' : r[ci]).split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (v) {
          if (!vals.some(function (x) { return L.clean(x) === L.clean(v); }) && L.clean(v)) { vals.push(v); cn.push(names[k]); }
        });
      });
      if (!vals.length) return;
      var q = qi >= 0 ? parseInt(String(r[qi]).replace(/[^\d]/g, ''), 10) : NaN;
      items.push({ no: vals[0], alts: vals, cols: cn, qty: q > 0 ? q : 1, desc: di >= 0 ? String(r[di] || '').trim() : '', orig: r });
    });
    var info = items.length.toLocaleString() + ' rows read. Numbers taken from ' + (hasHead ? 'column' + (names.length > 1 ? 's ' : ' ') + names.map(function (n) { return '"' + n + '"'; }).join(', ') : 'the first column') +
      (names.length > 1 ? ' (a row is found if any of them matches)' : '') + '; ' + (qi >= 0 ? 'quantities from "' + rows[0][qi] + '".' : 'quantity 1 each (no quantity column found).');
    // the customer's own columns are kept so downloads can return their file with the results added
    var width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var headers = []; for (var h = 0; h < width; h++) headers.push(hasHead ? String(rows[0][h] == null ? '' : rows[0][h]).trim() || 'Column ' + (h + 1) : 'Column ' + (h + 1));
    return { items: items, info: info, headers: headers, fileName: file.name };
  };
  // rows with one or several numbers each -> one result line per (row, matched part), plus the number that matched per row
  L.lookupItems = async function (items, onProgress) {
    var terms = [], map = [];
    items.forEach(function (it, i) { (it.alts && it.alts.length ? it.alts : [it.no]).forEach(function (v, j) { terms.push(v); map.push({ i: i, col: (it.cols || [])[j] || '' }); }); });
    var res = await L.lookupNumbers(terms, onProgress ? function (d, t) { onProgress(Math.round(d / t * items.length), items.length); } : null);
    var per = items.map(function () { return { pns: {}, order: [], best: null }; });
    res.forEach(function (r) {
      if (!r.lucas_pn) return;
      var m = map[r.ord - 1], g = per[m.i];
      if (!g.best) g.best = r.term;
      var multi = (items[m.i].alts || []).length > 1, via = (m.col && multi ? m.col + ' › ' : '') + (r.matched_via || '');
      if (!g.pns[r.lucas_pn]) { g.pns[r.lucas_pn] = Object.assign({}, r, { vias: [via] }); g.order.push(r.lucas_pn); }
      else if (g.pns[r.lucas_pn].vias.indexOf(via) < 0) g.pns[r.lucas_pn].vias.push(via);
    });
    var rows = [];
    items.forEach(function (it, i) {
      var g = per[i], shown = (it.alts || [it.no]).join(' / '), n = g.order.length;
      if (!n) { rows.push({ ord: i + 1, term: shown, result: 'Not found', lucas_pn: null, matched_via: null, matches: 0 }); return; }
      g.order.sort().forEach(function (pn) {
        var r = g.pns[pn];
        rows.push({ ord: i + 1, term: shown, result: n > 1 ? 'Several matches' : 'Found', lucas_pn: pn, matched_via: r.vias.join('; '), matches: n,
          description: r.description, subcategory: r.subcategory, status: r.status, fob_usd: r.fob_usd, available: r.available });
      });
    });
    return { rows: rows, best: per.map(function (g) { return g.best; }) };
  };
  L.lookupNumbers = async function (terms, onProgress) {   // bulk matching in the database, 250 per call, 4 in parallel
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

  // =====================================================================
  // routing:  #/app/part/part?key=value
  // =====================================================================
  L.route = function () {
    var h = location.hash.replace(/^#\/?/, ''), qi = h.indexOf('?'), q = {};
    if (qi >= 0) { h.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); h = h.slice(0, qi); }
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { app: parts[0] || '', parts: parts.slice(1), q: q };
  };
  L.href = function (app, parts, q) {
    var s = '#/' + [app].concat(parts || []).map(encodeURIComponent).join('/');
    var qs = Object.keys(q || {}).filter(function (k) { return q[k] !== '' && q[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    return s + (qs ? '?' + qs : '');
  };
  L.go = function (href) { if (location.hash === href) render(); else location.hash = href; };
  L.openPart = function (pn) { L.go(L.href('parts', ['p', pn])); };
  window.addEventListener('hashchange', function () { if (L.ROLE) render(); });

  // =====================================================================
  // apps and the shell
  // =====================================================================
  // app: { key, name, color, icon (svg path markup), menus: [{label, href | children:[...], editor, action}], route: fn(r) }
  L.register = function (app) { L.apps.push(app); };
  function appByKey(k) { return L.apps.find(function (a) { return a.key === k; }); }
  function icon(app, size) { return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + app.icon + '</svg>'; }

  function menuHtml(m) {
    if (m.editor && !L.isEditor()) return '';
    if (m.children) {
      var kids = m.children.filter(function (c) { return !c.editor || L.isEditor(); });
      if (!kids.length) return '';
      return '<div class="o-menu"><button type="button" class="o-menu-btn" data-dd>' + esc(m.label) + ' <span class="caret">▾</span></button><div class="o-dropdown" hidden>' +
        kids.map(function (c) { return c.href ? '<a href="' + c.href + '">' + esc(c.label) + '</a>' : '<button type="button" data-action="' + esc(c.action) + '">' + esc(c.label) + '</button>'; }).join('') + '</div></div>';
    }
    return m.href ? '<a class="o-menu-btn" href="' + m.href + '" data-menu="' + esc(m.href) + '">' + esc(m.label) + '</a>' : '<button type="button" class="o-menu-btn" data-action="' + esc(m.action) + '">' + esc(m.label) + '</button>';
  }
  var current = null;
  function setNav(app) {
    current = app;
    $('navApp').textContent = app ? app.name : 'Lucas MEA';
    $('navApp').href = app ? L.href(app.key) : '#/';
    $('navMenus').innerHTML = app ? (app.menus || []).map(menuHtml).join('') : '';
  }
  // close dropdowns when clicking elsewhere; open on click
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-dd]');
    document.querySelectorAll('.o-dropdown').forEach(function (d) { if (!t || d !== t.nextElementSibling) { if (!d.contains(e.target) || e.target.closest('a,button[data-action]')) d.hidden = true; } });
    if (t) { var dd = t.nextElementSibling; dd.hidden = !dd.hidden; }
  });
  $('navMenus').addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]'); if (!b || !current || !current.actions) return;
    var fn = current.actions[b.dataset.action]; if (fn) fn();
  });

  // control panel: crumbs = [[label, href], ..., [label]]
  L.cp = function (o) {
    o = o || {};
    $('cp').hidden = false;
    $('cpCrumbs').innerHTML = (o.crumbs || []).map(function (c, i, a) { return i < a.length - 1 && c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a><span class="sep">/</span>' : '<span class="cur">' + esc(c[0]) + '</span>'; }).join('');
    $('cpButtons').innerHTML = o.buttons || '';
    $('cpSearch').innerHTML = o.search || '';
    $('cpTools').innerHTML = o.tools || '';
  };
  L.content = function (html) { $('content').innerHTML = html; $('content').scrollTop = 0; window.scrollTo(0, 0); };

  // Odoo-style search: facets inside the box, filter dropdown. cfg = {placeholder, text, filters:[{key,label,group}], active:{key:true}, onChange(state)}
  L.searchBar = function (cfg) {
    var active = Object.assign({}, cfg.active || {}), text = cfg.text || '';
    var groups = []; (cfg.filters || []).forEach(function (f) { if (groups.indexOf(f.group) < 0) groups.push(f.group); });
    function facets() {
      return groups.map(function (g) {
        var on = (cfg.filters || []).filter(function (f) { return f.group === g && active[f.key]; });
        return on.length ? '<span class="o-facet"><span class="o-facet-g">' + esc(g) + '</span>' + on.map(function (f) { return esc(f.label); }).join(' <i>or</i> ') + '<button type="button" data-clear="' + esc(g) + '" aria-label="Remove">×</button></span>' : '';
      }).join('');
    }
    function dd() {
      return groups.map(function (g) {
        return '<div class="o-dd-group"><div class="o-dd-title">' + esc(g) + '</div>' + cfg.filters.filter(function (f) { return f.group === g; }).map(function (f) {
          return '<button type="button" data-fk="' + esc(f.key) + '" class="' + (active[f.key] ? 'on' : '') + '">' + esc(f.label) + '</button>';
        }).join('') + '</div>';
      }).join('');
    }
    $('cpSearch').innerHTML = '<div class="o-search"><span class="o-search-ico">⌕</span><span class="o-facets" id="sbFacets">' + facets() + '</span><input type="search" id="sbText" placeholder="' + esc(cfg.placeholder || 'Search…') + '" value="' + esc(text) + '">' +
      (groups.length ? '<button type="button" class="o-search-toggle" data-dd title="Filters">▾</button><div class="o-dropdown right o-filters" id="sbDD" hidden>' + dd() + '</div>' : '') + '</div>';
    var fire = function () { cfg.onChange({ text: text, active: Object.assign({}, active) }); };
    $('sbText').addEventListener('input', L.debounce(function () { text = $('sbText').value; fire(); }));
    $('sbText').addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !this.value) { var on = Object.keys(active).filter(function (k) { return active[k]; }); if (on.length) { delete active[on[on.length - 1]]; $('sbFacets').innerHTML = facets(); if ($('sbDD')) $('sbDD').innerHTML = dd(); fire(); } } });
    $('cpSearch').querySelector('.o-search').addEventListener('click', function (e) {
      var c = e.target.closest('[data-clear]'), f = e.target.closest('[data-fk]');
      if (c) { cfg.filters.forEach(function (x) { if (x.group === c.dataset.clear) delete active[x.key]; }); }
      else if (f) {
        var def = cfg.filters.find(function (x) { return x.key === f.dataset.fk; });
        if (def.single) cfg.filters.forEach(function (x) { if (x.group === def.group && x.key !== def.key) delete active[x.key]; });
        if (active[def.key]) delete active[def.key]; else active[def.key] = true;
      } else return;
      e.stopPropagation();
      $('sbFacets').innerHTML = facets(); if ($('sbDD')) $('sbDD').innerHTML = dd(); fire();
    });
  };
  // Odoo-style pager "1-80 / 6,033  ‹ ›"
  L.pager = function (offset, total, go, limit) {
    limit = limit || L.PAGE;
    if (!total) { $('cpTools').innerHTML = ''; return; }
    $('cpTools').innerHTML = '<div class="o-pager"><span>' + (offset + 1).toLocaleString() + '-' + Math.min(total, offset + limit).toLocaleString() + ' / ' + total.toLocaleString() + '</span>' +
      '<button type="button" data-p="-1"' + (offset <= 0 ? ' disabled' : '') + ' aria-label="Previous">‹</button><button type="button" data-p="1"' + (offset + limit >= total ? ' disabled' : '') + ' aria-label="Next">›</button></div>';
    $('cpTools').querySelector('.o-pager').onclick = function (e) { var b = e.target.closest('[data-p]'); if (b && !b.disabled) go(Math.max(0, offset + Number(b.dataset.p) * limit)); };
  };

  // form view: { crumbs, buttons, actions (left of statusbar), status: {steps, current, clickable, onClick}, sheet }
  L.form = function (o) {
    L.cp({ crumbs: o.crumbs, buttons: o.buttons || '', tools: o.tools || '' });
    var sb_ = '';
    if (o.status || o.actions) {
      var s = o.status;
      sb_ = '<div class="o-statusbar"><div class="o-sb-actions">' + (o.actions || '') + '</div>' + (s ? '<div class="o-steps">' + s.steps.map(function (st) {
        return '<button type="button" class="o-step' + (st === s.current ? ' on' : '') + '" data-step="' + esc(st) + '"' + (s.clickable ? '' : ' disabled') + '>' + esc(st) + '</button>';
      }).join('') + '</div>' : '') + '</div>';
    }
    L.content('<div class="o-form">' + sb_ + '<div class="o-sheet">' + o.sheet + '</div></div>');
    if (o.status && o.status.clickable) $('content').querySelector('.o-steps').onclick = function (e) { var b = e.target.closest('[data-step]'); if (b && !b.classList.contains('on')) o.status.onClick(b.dataset.step); };
  };
  // two-column field groups: [[label, valueHtml], ...]
  L.group = function (title, pairs) {
    return '<div class="o-group">' + (title ? '<div class="o-group-title">' + esc(title) + '</div>' : '') + pairs.map(function (p) { return '<div class="o-field"><label>' + esc(p[0]) + '</label><div class="o-val">' + (p[1] == null || p[1] === '' ? '<span class="muted">—</span>' : p[1]) + '</div></div>'; }).join('') + '</div>';
  };
  // notebook tabs: [{key, label, html}]
  L.notebook = function (tabs, active) {
    active = active || tabs[0].key;
    return '<div class="o-notebook"><div class="o-tabs">' + tabs.map(function (t) { return '<button type="button" data-tab="' + esc(t.key) + '" class="' + (t.key === active ? 'on' : '') + '">' + t.label + '</button>'; }).join('') + '</div>' +
      tabs.map(function (t) { return '<div class="o-page" data-page="' + esc(t.key) + '"' + (t.key === active ? '' : ' hidden') + '>' + t.html + '</div>'; }).join('') + '</div>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.o-notebook .o-tabs button'); if (!b) return;
    var nb = b.closest('.o-notebook');
    nb.querySelectorAll(':scope > .o-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    nb.querySelectorAll(':scope > .o-page').forEach(function (p) { p.hidden = p.dataset.page !== b.dataset.tab; });
  });
  // list view helper: columns [{key,label,num,render(row)}]; rows; rowHref(row)
  L.listView = function (cols, rows, rowHref) {
    return '<div class="o-list"><table class="grid"><thead><tr>' + cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        var h = rowHref ? rowHref(r) : null;
        return '<tr' + (h ? ' class="click" data-href="' + esc(h) + '"' : '') + '>' + cols.map(function (c) { return c.render ? '<td' + (c.num ? ' class="num"' : c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.render(r) + '</td>' : L.cell(c.key, r[c.key]); }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest('a,button,input,select,textarea,label')) return;
    var tr = e.target.closest('tr[data-href]'); if (tr) L.go(tr.dataset.href);
  });

  // modal wizard
  L.modal = function (title, html, wide) {
    $('modalTitle').textContent = title; $('modalBody').innerHTML = html;
    $('modal').querySelector('.o-modal-box').classList.toggle('wide', !!wide);
    $('modal').hidden = false; $('modalBody').scrollTop = 0;
  };
  L.closeModal = function () { $('modal').hidden = true; $('modalBody').innerHTML = ''; };
  $('modalClose').addEventListener('click', L.closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) L.closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) L.closeModal(); });
  L.pickFile = function (cb) { var f = $('hiddenFile'); f.value = ''; f.onchange = function () { if (f.files[0]) cb(f.files[0]); }; f.click(); };
  // removable rows inside forms
  document.addEventListener('click', function (e) { var x = e.target.closest('.rows .x'); if (x && x.parentElement) x.parentElement.remove(); });

  // =====================================================================
  // home: the app launcher
  // =====================================================================
  function home() {
    setNav(null); $('cp').hidden = true;
    var h = new Date().getHours(), hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    L.content('<div class="o-launcher"><div class="o-launcher-head"><img src="/assets/lucas-logo.png" alt="Lucas" width="992" height="200"><p>' + hello + '. ' + (L.isEditor() ? 'Data team access: you can view and edit.' : 'View-only access: you can view and download.') + '</p></div>' +
      '<div class="o-apps">' + L.apps.map(function (a) {
        return '<a class="o-app" href="' + L.href(a.key) + '"><span class="o-app-icon" style="background:' + a.color + '">' + icon(a, 40) + '</span><span class="o-app-name">' + esc(a.name) + '</span></a>';
      }).join('') + '</div></div>');
  }

  function render() {
    if (!$('modal').hidden) L.closeModal();
    document.querySelectorAll('.o-dropdown').forEach(function (d) { d.hidden = true; });
    var r = L.route();
    if (!r.app) return home();
    var app = appByKey(r.app);
    if (!app) return home();
    setNav(app);
    // highlight the menu whose link is the longest match of the current address
    var best = null, h = location.hash.split('?')[0];
    document.querySelectorAll('#navMenus [data-menu]').forEach(function (a) { var m = a.dataset.menu.split('?')[0]; if (h.indexOf(m) === 0 && (!best || m.length > best.dataset.menu.split('?')[0].length)) best = a; });
    document.querySelectorAll('#navMenus [data-menu]').forEach(function (a) { a.classList.toggle('on', a === best); });
    try { app.route(r); } catch (e) { L.fail(e); }
    document.title = app.name + ' · Lucas Staff';
  }
  L.render = render;

  // =====================================================================
  // sign in
  // =====================================================================
  var recovering = !!LINK_TYPE;
  function authScreen(id) { $('app').hidden = true; $('auth').hidden = false; ['login', 'setPass', 'noAccess'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function passScreen() {
    var invite = LINK_TYPE === 'invite' || LINK_TYPE === 'signup';
    $('setPassTitle').textContent = invite ? 'Welcome! Choose your password' : 'Choose a new password';
    $('setPassIntro').textContent = invite ? 'You have been invited to the Lucas MEA staff site. Choose a password (at least 8 characters) to finish setting up your account.' : '';
    authScreen('setPass');
  }
  sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') { recovering = true; passScreen(); } });
  async function boot() {
    try {
      if (recovering) {
        var ss = (await sb.auth.getSession()).data.session;
        if (ss) { $('setPassEmail').textContent = ss.user.email; return passScreen(); }
        recovering = false; LINK_TYPE = null;   // link expired or already used
        $('lMsg').className = 'msg err'; $('lMsg').textContent = 'That link has expired or was already used. Ask the data team for a new invitation, or use "Forgot password?".';
      }
      var session = (await sb.auth.getSession()).data.session;
      if (!session) return authScreen('login');
      L.EMAIL = session.user.email;
      var role = L.must(await sb.rpc('my_staff_role'));
      if (!role) { $('naEmail').textContent = L.EMAIL; return authScreen('noAccess'); }
      L.ROLE = role; document.body.classList.toggle('viewer', !L.isEditor());
      L.CATS = L.must(await sb.from('categories').select('name,subcategory_key,group_name,view_name,status,sort_order').eq('status', 'live').order('sort_order'));
      var ini = L.EMAIL.split('@')[0].split(/[._-]/).filter(Boolean).map(function (s) { return s[0]; }).join('').slice(0, 2).toUpperCase();
      $('avatarBtn').textContent = ini || 'U'; $('avatarBtn').setAttribute('data-dd', '');
      $('userMenu').innerHTML = '<div class="o-dd-info"><b>' + esc(L.EMAIL) + '</b><span>' + (L.isEditor() ? 'Data team · can edit' : 'View only') + '</span></div><a href="#/">All apps</a><button type="button" id="signOut">Sign out</button>';
      $('signOut').addEventListener('click', signOut);
      $('auth').hidden = true; $('app').hidden = false;
      render();
    } catch (e) { L.fail(e); authScreen('login'); }
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
    recovering = false; LINK_TYPE = null; history.replaceState(null, '', '/admin/'); L.toast('Password saved. Welcome!'); boot();
  });
  async function signOut() { await sb.auth.signOut(); L.ROLE = null; location.replace('/admin/'); }
  $('naOut').addEventListener('click', signOut);

  L.start = function () { setTimeout(boot, 50); };
  return L;
})();
