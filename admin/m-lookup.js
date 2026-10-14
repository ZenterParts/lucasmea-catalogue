/* App: Number lookup. Thousands of Lucas / OE / competitor numbers matched in one go */
(function (L) {
  'use strict';
  var esc = L.esc, $ = L.$;
  var S = L.state.lookup = { text: '', items: [], rows: [], filter: 'all', info: '' };
  var SHOW = 2000;

  function page() {
    L.cp({ crumbs: [['Number lookup']],
      buttons: '<button type="button" class="btn" id="lkGo">Look up</button><button type="button" class="btn ghost" id="lkUp">Upload a list</button><button type="button" class="btn ghost" id="lkClear">Clear</button>',
      tools: S.rows.length ? '<button type="button" class="btn ghost" id="lkXls">Download results</button><button type="button" class="btn editor-only" id="lkInq">Create inquiry from this list</button>' : '' });
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
    $('lkGo').onclick = function () { S.info = ''; run(L.parseListText($('lkInput').value)); };
    $('lkInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('lkGo').click(); });
    $('lkInput').addEventListener('input', function () { S.text = this.value; });
    $('lkUp').onclick = function () { L.pickFile(async function (f) { try { var r = await L.parseListFile(f); S.info = r.info; S.text = L.listToText(r.items); $('lkInput').value = S.text; $('lkInfo').textContent = r.info; run(r.items); } catch (e) { L.fail(e); } }); };
    $('lkClear').onclick = function () { S.text = ''; S.items = []; S.rows = []; S.info = ''; page(); };
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
  function excel() {
    var head = ['#', 'Searched', 'Qty', 'Result', 'Lucas PN', 'Matched as', 'Description', 'Range', 'Status', 'FOB USD', 'Line FOB USD', 'Available'];
    var row = function (r) { var it = S.items[r.ord - 1] || {}, fob = r.fob_usd == null ? '' : Number(r.fob_usd);
      return [r.ord, r.term, it.qty || 1, r.result === 'Several matches' ? r.matches + ' possible parts' : r.result, r.lucas_pn || '', r.matched_via || '', r.description || '', r.subcategory || '', r.status || '', fob, fob === '' || r.result !== 'Found' ? '' : Math.round(fob * (it.qty || 1) * 100) / 100, r.available == null ? '' : Number(r.available)]; };
    var nf = S.rows.filter(function (r) { return r.result === 'Not found'; });
    var sheets = [{ name: 'Lookup', widths: [6, 22, 6, 18, 12, 34, 50, 14, 8, 10, 12, 10], head: head, rows: S.rows.map(row) }];
    if (nf.length) sheets.push({ name: 'Not found', widths: [6, 22, 6], head: ['#', 'Searched', 'Qty'], rows: nf.map(function (r) { return [r.ord, r.term, (S.items[r.ord - 1] || {}).qty || 1]; }) });
    return L.saveXlsx(sheets, 'Lucas_number_lookup_' + L.today() + '.xlsx');
  }

  L.register({
    key: 'lookup', name: 'Number Lookup', color: '#231F20',
    icon: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path d="M8 10.5h5M10.5 8v5"/>',
    menus: [{ label: 'Lookup', href: L.href('lookup') }],
    route: function () { page(); }
  });
})(window.LS);
