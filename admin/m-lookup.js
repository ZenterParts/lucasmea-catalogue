/* Module 2: Number lookup. Any number of Lucas / OE / competitor numbers matched in one go */
(function (L) {
  'use strict';
  var $ = L.$, esc = L.esc, st = { items: [], rows: [], filter: 'all' };
  var SHOW = 2000;

  async function run(items) {
    if (!items.length) return L.toast('Paste or upload some numbers first');
    if (items.length > 10000) return L.toast('Up to 10,000 numbers at a time; split the list');
    var btn = $('lkGo'); btn.disabled = true;
    try {
      st.items = items;
      st.rows = await L.lookupNumbers(items.map(function (i) { return i.no; }), function (d, t) { btn.textContent = 'Looking up ' + d.toLocaleString() + ' / ' + t.toLocaleString(); });
      st.filter = 'all'; render();
    } catch (e) { L.fail(e); }
    btn.disabled = false; btn.textContent = 'Look up';
  }

  function counts() {
    var seen = {}, c = { all: st.items.length, Found: 0, 'Several matches': 0, 'Not found': 0 };
    st.rows.forEach(function (r) { if (!seen[r.ord]) { seen[r.ord] = 1; c[r.result]++; } });
    return c;
  }
  function render() {
    var c = counts(), f = st.filter;
    $('lkResult').hidden = false;
    $('lkChips').innerHTML = L.chip(c.all.toLocaleString() + ' numbers', f === 'all' ? 'on' : '', 'all') +
      L.chip(c.Found.toLocaleString() + ' found', 'good' + (f === 'Found' ? ' on' : ''), 'Found') +
      L.chip(c['Several matches'].toLocaleString() + ' several matches', (f === 'Several matches' ? 'on' : ''), 'Several matches') +
      L.chip(c['Not found'].toLocaleString() + ' not found', 'warn' + (f === 'Not found' ? ' on' : ''), 'Not found');
    var rows = st.rows.filter(function (r) { return f === 'all' || r.result === f; }), prev = null;
    $('lkTable').innerHTML = '<thead><tr><th>#</th><th>Searched</th><th class="num">Qty</th><th>Result</th><th>Lucas PN</th><th>Matched as</th><th>Description</th><th>Range</th><th>Status</th><th class="num">FOB USD</th><th class="num">Available</th></tr></thead><tbody>' +
      rows.slice(0, SHOW).map(function (r) {
        var first = r.ord !== prev; prev = r.ord;
        var it = st.items[r.ord - 1] || {};
        var res = r.result === 'Not found' ? '<span class="flag">Not found</span>' : r.result === 'Several matches' ? '<span class="pill Quoted">' + r.matches + ' possible parts</span>' : '<span class="pill Won">Found</span>';
        return '<tr class="' + (r.lucas_pn ? 'click' : '') + (first ? '' : ' cont') + '"' + (r.lucas_pn ? ' data-pn="' + esc(r.lucas_pn) + '"' : '') + '><td>' + (first ? r.ord : '') + '</td><td>' + (first ? esc(r.term) : '') + '</td><td class="num">' + (first ? L.qty(it.qty) : '') + '</td><td>' + (first ? res : '') +
          '</td><td class="pn">' + esc(r.lucas_pn || '') + '</td><td class="clip small">' + esc(r.matched_via || '') + '</td><td class="clip">' + esc(r.description || '') + '</td><td>' + esc(r.subcategory || '') + '</td><td>' + esc(r.status || '') +
          '</td><td class="num">' + L.money(r.fob_usd) + '</td><td class="num">' + L.qty(r.available) + '</td></tr>';
      }).join('') + '</tbody>';
    $('lkMore').textContent = rows.length > SHOW ? 'Showing the first ' + SHOW.toLocaleString() + ' of ' + rows.length.toLocaleString() + ' rows. The Excel download has all of them.' : '';
  }

  function excel() {
    var head = ['#', 'Searched', 'Qty', 'Result', 'Lucas PN', 'Matched as', 'Description', 'Range', 'Status', 'FOB USD', 'Line FOB USD', 'Available'];
    var row = function (r) { var it = st.items[r.ord - 1] || {}; var fob = r.fob_usd == null ? '' : Number(r.fob_usd);
      return [r.ord, r.term, it.qty || 1, r.result === 'Several matches' ? r.matches + ' possible parts' : r.result, r.lucas_pn || '', r.matched_via || '', r.description || '', r.subcategory || '', r.status || '', fob, fob === '' || r.result !== 'Found' ? '' : Math.round(fob * (it.qty || 1) * 100) / 100, r.available == null ? '' : Number(r.available)]; };
    var nf = st.rows.filter(function (r) { return r.result === 'Not found'; });
    var sheets = [{ name: 'Lookup', widths: [6, 22, 6, 18, 12, 34, 50, 14, 8, 10, 12, 10], head: head, rows: st.rows.map(row) }];
    if (nf.length) sheets.push({ name: 'Not found', widths: [6, 22, 6], head: ['#', 'Searched', 'Qty'], rows: nf.map(function (r) { return [r.ord, r.term, (st.items[r.ord - 1] || {}).qty || 1]; }) });
    return L.saveXlsx(sheets, 'Lucas_number_lookup_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  L.modules.lookup = {
    init: function () {
      $('lkGo').addEventListener('click', function () { $('lkFileInfo').textContent = ''; run(L.parseListText($('lkInput').value)); });
      $('lkInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(L.parseListText($('lkInput').value)); });
      $('lkClear').addEventListener('click', function () { $('lkInput').value = ''; $('lkResult').hidden = true; $('lkFile').value = ''; $('lkFileInfo').textContent = ''; st.rows = []; st.items = []; });
      $('lkFile').addEventListener('change', async function () {
        var f = this.files[0]; if (!f) return;
        try {
          var r = await L.parseListFile(f); $('lkFileInfo').textContent = r.info;
          $('lkInput').value = r.items.map(function (i) { return i.qty > 1 ? i.no + '; ' + i.qty : i.no; }).join('\n');
          run(r.items);
        } catch (e) { L.fail(e); }
      });
      $('lkChips').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) { st.filter = b.dataset.f; render(); } });
      $('lkXls').addEventListener('click', function () { excel().catch(L.fail); });
      $('lkToInquiry').addEventListener('click', function () { if (st.items.length) L.newInquiry(st.items.slice()); });
      $('lkTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-pn]'); if (tr && L.openPart) L.openPart(tr.dataset.pn); });
      $('lkInput').focus();
    },
    show: function () { $('lkInput').focus(); }
  };
})(window.LS);
