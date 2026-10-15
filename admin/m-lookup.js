/* App: Number lookup. Thousands of Lucas / OE / competitor numbers matched in one go */
(function (L) {
  'use strict';
  var esc = L.esc, $ = L.$;
  var S = L.state.lookup = { text: '', items: [], rows: [], filter: 'all', info: '', headers: null, fileName: '' };
  var SHOW = 2000;

  function page() {
    L.cp({ crumbs: [['Number lookup']],
      buttons: '<button type="button" class="btn" id="lkGo">Look up</button><button type="button" class="btn ghost" id="lkUp">Upload a list</button><button type="button" class="btn ghost" id="lkClear">Clear</button>',
      tools: S.rows.length ? '<button type="button" class="btn ghost" id="lkXls">' + (S.headers ? 'Download your file with results' : 'Download results') + '</button><button type="button" class="btn editor-only" id="lkInq">Create inquiry from this list</button>' : '' });
    L.content('<div class="cols2" style="margin-bottom:14px"><div class="card"><h2>Numbers to look up</h2>' +
      '<textarea id="lkInput" class="mono" rows="9" placeholder="One row per line, e.g.&#10;04C121004E&#10;MANN W 67/1&#10;5215796 ; 20          (quantity after ;)&#10;90915-YZZJ3 | WE01-13-Z40 ; 2   (OE | reference ; quantity)">' + esc(S.text) + '</textarea>' +
      '<p class="muted small" id="lkInfo">' + esc(S.info) + '</p></div>' +
      '<div class="card"><h2>How it matches</h2><ul class="small" style="margin:0;padding-left:18px;line-height:1.6">' +
      '<li>Spaces, hyphens, dots, slashes and capitals are ignored: <span class="mono">04C 121-004.e</span> = <span class="mono">04C121004E</span>.</li>' +
      '<li>A Lucas part number wins; otherwise OE and competitor numbers are searched.</li>' +
      '<li>A brand in front is dropped if nothing matched: <span class="mono">MANN W67/1</span>, <span class="mono">BOSCH 0 986 452 044</span>.</li>' +
      '<li>Several numbers for one row (OE, reference, article no.…): put them on one line separated by <span class="mono">|</span>, or upload the file: every number column is used and the row is found if any of them matches.</li>' +
      '<li>Up to 10,000 rows at a time. Quantity after <span class="mono">;</span> or from a Qty column.</li></ul></div></div>' +
      '<div id="lkRes"></div>');
    $('lkGo').onclick = function () {
      // re-running the text keeps the uploaded file's columns only if the text was not edited
      if (S.text !== S.uploadedText) { S.info = ''; S.headers = null; S.fileName = ''; }
      run(S.headers ? S.items : L.parseListText($('lkInput').value));
    };
    $('lkInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('lkGo').click(); });
    $('lkInput').addEventListener('input', function () { S.text = this.value; });
    $('lkUp').onclick = function () { L.pickFile(async function (f) { try { var r = await L.parseListFile(f); S.info = r.info; S.headers = r.headers; S.fileName = r.fileName; S.text = S.uploadedText = L.listToText(r.items); $('lkInput').value = S.text; $('lkInfo').textContent = r.info; run(r.items); } catch (e) { L.fail(e); } }); };
    $('lkClear').onclick = function () { S.text = ''; S.items = []; S.rows = []; S.info = ''; S.headers = null; S.fileName = ''; page(); };
    if (S.rows.length) results(); else $('lkInput').focus();
  }
  async function run(items) {
    if (!items.length) return L.toast('Paste or upload some numbers first');
    if (items.length > 10000) return L.toast('Up to 10,000 numbers at a time; split the list');
    var btn = $('lkGo'); btn.disabled = true;
    try {
      S.items = items;
      var res = await L.lookupItems(items, function (d, t) { btn.textContent = 'Looking up ' + d.toLocaleString() + ' / ' + t.toLocaleString(); });
      S.rows = res.rows; S.best = res.best;
      S.filter = 'all'; page();
    } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Look up'; }
  }
  function counts() {
    var seen = {}, c = { all: S.items.length, Found: 0, 'Several matches': 0, 'Not found': 0 };
    S.rows.forEach(function (r) { if (!seen[r.ord]) { seen[r.ord] = 1; c[r.result]++; } });
    return c;
  }
  function results() {
    var c = counts(), f = S.filter;
    var rows = S.rows.filter(function (r) { return f === 'all' || r.result === f; }), prev = null;
    $('lkRes').innerHTML = '<div class="o-bar chips" id="lkChips">' + L.chip(c.all.toLocaleString() + ' rows', f === 'all' ? 'on' : '', 'all') +
      L.chip(c.Found.toLocaleString() + ' found', 'good' + (f === 'Found' ? ' on' : ''), 'Found') +
      L.chip(c['Several matches'].toLocaleString() + ' several possible parts', f === 'Several matches' ? 'on' : '', 'Several matches') +
      L.chip(c['Not found'].toLocaleString() + ' not found', 'warn' + (f === 'Not found' ? ' on' : ''), 'Not found') + '</div>' +
      '<div class="o-list"><table class="grid"><thead><tr><th>#</th><th>Searched</th><th class="num">Qty</th><th>Result</th><th>Lucas PN</th><th>Matched as</th><th>Description</th><th>Range</th><th>Status</th><th class="num">FOB USD</th><th class="num">Available</th></tr></thead><tbody>' +
      rows.slice(0, SHOW).map(function (r) {
        var first = r.ord !== prev; prev = r.ord;
        var it = S.items[r.ord - 1] || {};
        var res = r.result === 'Not found' ? '<span class="flag">Not found</span>' : r.result === 'Several matches' ? L.pill(r.matches + ' possible parts', 'Quoted') : L.pill('Found');
        return '<tr class="' + (r.lucas_pn ? 'click' : '') + (first ? '' : ' cont') + '"' + (r.lucas_pn ? ' data-href="' + esc(L.href('parts', ['p', r.lucas_pn])) + '"' : '') + '><td>' + (first ? r.ord : '') + '</td><td>' + (first ? esc(r.term) : '') + '</td><td class="num">' + (first ? L.qty(it.qty) : '') + '</td><td>' + (first ? res : '') +
          '</td><td class="pn">' + esc(r.lucas_pn || '') + '</td><td class="clip small">' + esc(r.matched_via || '') + '</td><td class="clip">' + esc(r.description || '') + '</td><td>' + esc(r.subcategory || '') + '</td><td>' + esc(r.status || '') +
          '</td><td class="num">' + L.money(r.fob_usd) + '</td><td class="num">' + L.qty(r.available) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (rows.length > SHOW ? '<p class="muted small">Showing the first ' + SHOW.toLocaleString() + ' of ' + rows.length.toLocaleString() + ' rows. The Excel download has all of them.</p>' : '');
    $('lkChips').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { S.filter = b.dataset.f; results(); } };
    if ($('lkXls')) $('lkXls').onclick = function () { excel().catch(L.fail); };
    if ($('lkInq')) $('lkInq').onclick = function () { L.newInquiry(S.items.slice(), S.best); };
  }
  // vehicle makes the Lucas catalogue lists for each matched part
  async function makesFor(rows) {
    var pns = Array.from(new Set(rows.map(function (r) { return r.lucas_pn; }).filter(Boolean))), out = {};
    for (var ch of L.chunks(pns, 200)) L.must(await L.sb.from('part_summary').select('lucas_pn,vehicle_makes').in('lucas_pn', ch)).forEach(function (x) { out[x.lucas_pn] = x.vehicle_makes || ''; });
    return out;
  }
  async function excel() {
    L.toast('Preparing the download…');
    var makes = await makesFor(S.rows);
    var RES = ['Result', 'Lucas PN', 'Matched as', 'Lucas description', 'Range', 'Status', 'FOB USD', 'Line FOB USD', 'Available', 'Vehicle makes (Lucas catalogue)'];
    var RW = [16, 12, 34, 46, 14, 8, 10, 12, 10, 36];
    var byOrd = {}; S.rows.forEach(function (r) { (byOrd[r.ord] = byOrd[r.ord] || []).push(r); });
    var fob = function (r) { return r.fob_usd == null ? '' : Number(r.fob_usd); };
    var res1 = function (r, it) {   // one result row -> result columns
      var f = fob(r), found = r.result === 'Found';
      return [r.result === 'Several matches' ? r.matches + ' possible parts' : r.result, r.lucas_pn || '', r.matched_via || '', r.description || '', r.subcategory || '', r.status || '',
        f, f === '' || !found ? '' : Math.round(f * (it.qty || 1) * 100) / 100, r.available == null ? '' : Number(r.available), makes[r.lucas_pn] || ''];
    };
    var resMany = function (list, it) {   // several possible parts -> one summary line
      return [list.length + ' possible parts', list.map(function (r) { return r.lucas_pn; }).join(', '), list.map(function (r) { return r.lucas_pn + ': ' + (r.matched_via || ''); }).join('; '),
        list.map(function (r) { return r.lucas_pn + ': ' + (r.description || ''); }).join('; '), Array.from(new Set(list.map(function (r) { return r.subcategory; }))).join(', '), '', '', '', '',
        Array.from(new Set(list.map(function (r) { return makes[r.lucas_pn]; }).filter(Boolean))).join('; ')];
    };
    var sheets = [], name = 'Lucas_number_lookup_' + L.today() + '.xlsx';
    if (S.headers) {
      // the customer's file, row for row, with the Lucas results added on the right
      var W = S.headers.length, pad = function (o) { var a = []; for (var i = 0; i < W; i++) a.push(o && o[i] != null ? o[i] : ''); return a; };
      // if the customer's file has a vehicle make column, suggest which of several possible parts fits that make
      var mi = S.headers.map(L.normHead).findIndex(function (h) { return /^(make|vehiclemake|carmake|vehiclebrand|carbrand|manufacturer|vehicle)$/.test(h); });
      var suggest = function (list, it) {
        if (mi < 0 || !it.orig) return '';
        var mk = String(it.orig[mi] || '').trim().toUpperCase(); if (!mk) return '';
        var hit = list.filter(function (r) { return String(makes[r.lucas_pn] || '').toUpperCase().split(/\s*,\s*/).some(function (m) { return m && (m === mk || m.indexOf(mk) === 0 || mk.indexOf(m) === 0); }); });
        return hit.length && hit.length < list.length ? hit.map(function (r) { return r.lucas_pn; }).join(', ') : '';
      };
      if (mi >= 0) { RES = RES.concat(['Suggested for ' + S.headers[mi]]); RW = RW.concat([18]); }
      var widths = S.headers.map(function (h) { return Math.min(30, Math.max(12, String(h).length + 2)); }).concat(RW);
      sheets.push({ name: 'Mapped', widths: widths, head: S.headers.concat(RES), rows: S.items.map(function (it, i) {
        var list = byOrd[i + 1] || [];
        var out = pad(it.orig).concat(list.length > 1 ? resMany(list, it) : res1(list[0] || { result: 'Not found' }, it));
        if (mi >= 0) out.push(list.length > 1 ? suggest(list, it) : '');
        return out;
      }) });
      var many = S.rows.filter(function (r) { return r.result === 'Several matches'; });
      if (many.length) sheets.push({ name: 'Several matches', widths: widths, head: S.headers.concat(RES), rows: many.map(function (r) { var it = S.items[r.ord - 1] || {}, o = pad(it.orig).concat(res1(r, it)); if (mi >= 0) o.push(suggest(byOrd[r.ord], it).split(', ').indexOf(r.lucas_pn) >= 0 ? 'fits ' + it.orig[mi] : ''); return o; }) });
      var nf = S.items.filter(function (it, i) { return (byOrd[i + 1] || [])[0] && byOrd[i + 1][0].result === 'Not found'; });
      if (nf.length) sheets.push({ name: 'Not found', widths: widths.slice(0, W), head: S.headers, rows: nf.map(function (it) { return pad(it.orig); }) });
      name = (S.fileName ? S.fileName.replace(/\.(xlsx|csv|txt)$/i, '') : 'Customer_list') + '_Lucas_mapped.xlsx';
    } else {
      var head = ['#', 'Searched', 'Qty'].concat(RES);
      sheets.push({ name: 'Lookup', widths: [6, 22, 6].concat(RW), head: head, rows: S.rows.map(function (r) { var it = S.items[r.ord - 1] || {}; return [r.ord, r.term, it.qty || 1].concat(res1(r, it)); }) });
      var nf2 = S.rows.filter(function (r) { return r.result === 'Not found'; });
      if (nf2.length) sheets.push({ name: 'Not found', widths: [6, 22, 6], head: ['#', 'Searched', 'Qty'], rows: nf2.map(function (r) { return [r.ord, r.term, (S.items[r.ord - 1] || {}).qty || 1]; }) });
    }
    return L.saveXlsx(sheets, name);
  }

  L.register({
    key: 'lookup', name: 'Number Lookup', color: '#231F20',
    icon: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path d="M8 10.5h5M10.5 8v5"/>',
    menus: [{ label: 'Lookup', href: L.href('lookup') }],
    route: function () { page(); }
  });
})(window.LS);
