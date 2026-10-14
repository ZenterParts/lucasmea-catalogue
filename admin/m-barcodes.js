/* App: Barcodes. Coverage, existing barcodes drawn and checked (EAN-13); generation rules plug into LS.barcodeRule */
(function (L) {
  'use strict';
  var esc = L.esc, sb = L.sb, $ = L.$;
  var S = L.state.bc = { range: '', text: '', active: { has_missing: true }, offset: 0, sel: {} };
  var BASE = L.href('barcodes');
  var FILTERS = [{ key: 'has_missing', label: 'Without barcode', group: 'Barcode', single: true }, { key: 'has_yes', label: 'With barcode', group: 'Barcode', single: true }];

  /* ===== barcode rules: to be provided by the data team =====
     part: the product row; used: barcodes already in use. Return a 13-digit barcode, or null while no rule is defined. */
  L.barcodeRule = function (part, used) {   // eslint-disable-line no-unused-vars
    return null;
  };

  L.ean13Valid = function (code) {
    if (!/^\d{13}$/.test(code || '')) return false;
    var s = 0; for (var i = 0; i < 12; i++) s += Number(code[i]) * (i % 2 ? 3 : 1);
    return (10 - (s % 10)) % 10 === Number(code[12]);
  };
  var LC = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  var GC = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  var RC = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  var PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  L.ean13Svg = function (code, h) {
    if (!/^\d{13}$/.test(code || '')) return '';
    h = h || 34;
    var bits = '101', p = PAR[Number(code[0])], i;
    for (i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? LC : GC)[Number(code[i])];
    bits += '01010';
    for (i = 7; i <= 12; i++) bits += RC[Number(code[i])];
    bits += '101';
    var bars = '';
    for (i = 0; i < bits.length; i++) if (bits[i] === '1') { var g = i < 3 || (i >= 45 && i < 50) || i >= 92; bars += '<rect x="' + (9 + i) + '" y="0" width="1" height="' + (g ? h + 5 : h) + '"/>'; }
    return '<svg class="ean" viewBox="0 0 113 ' + (h + 14) + '" role="img" aria-label="EAN-13 ' + code + '"><g fill="#111">' + bars + '</g><text x="2" y="' + (h + 12) + '" font-size="10" font-family="monospace">' + code[0] + '</text>' +
      '<text x="14" y="' + (h + 12) + '" font-size="10" font-family="monospace" textLength="40">' + code.slice(1, 7) + '</text><text x="60" y="' + (h + 12) + '" font-size="10" font-family="monospace" textLength="40">' + code.slice(7) + '</text></svg>';
  };

  async function overview() {
    L.cp({ crumbs: [['Barcodes', BASE], ['Overview']], buttons: '<a class="btn" href="' + L.href('barcodes', ['parts']) + '">Parts without barcode</a>' });
    L.content('<div class="o-list" style="max-height:none"><table class="grid" id="bcCov"><tbody><tr><td class="empty">Loading…</td></tr></tbody></table></div>');
    try {
      var rows = await L.fetchAll(function () { return sb.from('products').select('lucas_pn,subcategory,barcode,status').order('lucas_pn'); });
      var by = {}, tot = { n: 0, has: 0, bad: 0 };
      rows.forEach(function (p) { if (p.status !== 'Active') return; var b = by[p.subcategory] = by[p.subcategory] || { n: 0, has: 0, bad: 0 }; b.n++; if (p.barcode) { b.has++; if (!L.ean13Valid(p.barcode)) b.bad++; } });
      $('bcCov').innerHTML = '<thead><tr><th>Range</th><th class="num">Active parts</th><th class="num">With barcode</th><th class="num">Without barcode</th><th class="num">Check digit wrong</th></tr></thead><tbody>' +
        L.CATS.map(function (c) { var b = by[c.subcategory_key] || { n: 0, has: 0, bad: 0 }; tot.n += b.n; tot.has += b.has; tot.bad += b.bad;
          return '<tr class="click" data-href="' + esc(L.href('barcodes', ['parts'], { range: c.subcategory_key })) + '"><td>' + esc(c.name) + '</td><td class="num">' + b.n.toLocaleString() + '</td><td class="num">' + b.has.toLocaleString() + '</td><td class="num">' + (b.n - b.has ? '<span class="flag">' + (b.n - b.has).toLocaleString() + '</span>' : '0') + '</td><td class="num">' + (b.bad ? '<span class="flag">' + b.bad + '</span>' : '0') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + tot.n.toLocaleString() + '</td><td class="num">' + tot.has.toLocaleString() + '</td><td class="num">' + (tot.n - tot.has).toLocaleString() + '</td><td class="num">' + tot.bad + '</td></tr></tfoot>';
    } catch (e) { L.fail(e); }
  }

  function query(opts) {
    var q = sb.from('products').select('lucas_pn,short_desc,subcategory,barcode,barcode_old,status', opts).eq('status', 'Active');
    if (S.range) q = q.eq('subcategory', S.range);
    if (S.active.has_missing) q = q.is('barcode', null);
    if (S.active.has_yes) q = q.not('barcode', 'is', null);
    var s = L.orSearch(['lucas_pn', 'short_desc', 'barcode'], S.text); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }
  function parts(r) {
    if (r.q.range != null) { S.range = r.q.range === 'all' ? '' : r.q.range; S.offset = 0; }
    L.cp({ crumbs: [['Barcodes', BASE], ['Parts']], buttons: '<button type="button" class="btn editor-only" id="bcGen" disabled>Generate barcodes</button><button type="button" class="btn ghost" id="bcXls">Download</button>' });
    L.searchBar({ placeholder: 'Search part no., description or barcode…', text: S.text, filters: FILTERS, active: S.active, onChange: function (s) { S.text = s.text; S.active = s.active; S.offset = 0; load(); } });
    L.content('<div class="o-with-panel"><nav class="o-panel"><div class="o-panel-title">Range</div><a href="' + L.href('barcodes', ['parts'], { range: 'all' }) + '" class="' + (!S.range ? 'on' : '') + '">All ranges</a>' +
      L.CATS.map(function (x) { return '<a href="' + L.href('barcodes', ['parts'], { range: x.subcategory_key }) + '" class="' + (x.subcategory_key === S.range ? 'on' : '') + '">' + esc(x.name) + '</a>'; }).join('') + '</nav><div id="bcList"></div></div>');
    $('bcGen').onclick = generate; $('bcXls').onclick = excel; updateGen(); load();
  }
  async function load() {
    try {
      var res = await query({ count: 'exact' }).range(S.offset, S.offset + L.PAGE - 1), rows = L.must(res);
      L.pager(S.offset, res.count || 0, function (o) { S.offset = o; load(); });
      if (!rows.length) { $('bcList').innerHTML = L.empty('No parts', 'Nothing matches.'); return; }
      $('bcList').innerHTML = '<div class="o-list"><table class="grid"><thead><tr><th class="editor-only"><input type="checkbox" id="bcAll"></th><th>Lucas PN</th><th>Description</th><th>Range</th><th>Barcode</th><th>Check</th><th></th></tr></thead><tbody>' +
        rows.map(function (p) {
          var ok = p.barcode ? L.ean13Valid(p.barcode) : null;
          return '<tr class="click" data-href="' + esc(L.href('parts', ['p', p.lucas_pn])) + '"><td class="editor-only"><input type="checkbox" data-pn="' + esc(p.lucas_pn) + '"' + (S.sel[p.lucas_pn] ? ' checked' : '') + '></td><td class="pn">' + esc(p.lucas_pn) + '</td><td class="clip">' + esc(p.short_desc) + '</td><td>' + esc(p.subcategory) +
            '</td><td class="mono">' + esc(p.barcode || '') + '</td><td>' + (ok === null ? '' : ok ? L.pill('Valid EAN-13', 'Found') : '<span class="flag">Check digit wrong</span>') + '</td><td>' + (ok ? L.ean13Svg(p.barcode, 20) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      $('bcList').querySelector('table').addEventListener('change', function (e) {
        if (e.target.id === 'bcAll') $('bcList').querySelectorAll('tbody input[data-pn]').forEach(function (c) { c.checked = e.target.checked; if (c.checked) S.sel[c.dataset.pn] = 1; else delete S.sel[c.dataset.pn]; });
        else if (e.target.dataset.pn) { if (e.target.checked) S.sel[e.target.dataset.pn] = 1; else delete S.sel[e.target.dataset.pn]; }
        updateGen();
      });
    } catch (e) { L.fail(e); }
  }
  function updateGen() { var n = Object.keys(S.sel).length, b = $('bcGen'); if (!b) return; b.disabled = !n; b.textContent = n ? 'Generate barcodes (' + n + ')' : 'Generate barcodes'; }
  async function generate() {
    var pns = Object.keys(S.sel); if (!pns.length) return;
    try {
      var used = (await L.fetchAll(function () { return sb.from('products').select('barcode').not('barcode', 'is', null).order('barcode'); })).map(function (r) { return r.barcode; });
      var list = []; for (var ch of L.chunks(pns, 300)) list = list.concat(L.must(await sb.from('products').select('*').in('lucas_pn', ch)));
      var out = list.map(function (p) { var code = L.barcodeRule(p, used); if (code) used.push(code); return { p: p, code: code }; });
      var ready = out.filter(function (o) { return o.code; });
      L.modal('Generate barcodes', !ready.length ? '<div class="notice"><b>Barcode rules not set yet.</b> ' + pns.length + ' parts selected. Once the data team provides the rules, the new barcodes are listed here for review before they are saved.</div>' :
        '<p>' + ready.length + ' of ' + pns.length + ' parts get a new barcode. Review, then save.</p>' + L.listView([{ label: 'Lucas PN', cls: 'pn', render: function (o) { return esc(o.p.lucas_pn); } }, { label: 'Description', cls: 'clip', render: function (o) { return esc(o.p.short_desc); } },
          { label: 'Current', render: function (o) { return esc(o.p.barcode || ''); } }, { label: 'New', render: function (o) { return esc(o.code || '') + (o.code && !L.ean13Valid(o.code) ? ' <span class="flag">invalid</span>' : ''); } }, { label: '', render: function (o) { return o.code ? L.ean13Svg(o.code, 20) : ''; } }], out) +
        '<div class="o-footer"><button class="btn" id="bcSave">Save ' + ready.length + ' barcodes</button></div>', true);
      if (ready.length) $('bcSave').onclick = async function () {
        this.disabled = true;
        try { for (var o of ready) L.must(await sb.from('products').update({ barcode: o.code, barcode_old: o.p.barcode || o.p.barcode_old || null }).eq('lucas_pn', o.p.lucas_pn)); S.sel = {}; L.closeModal(); L.toast('Saved ' + ready.length + ' barcodes'); L.render(); }
        catch (e) { L.fail(e); this.disabled = false; }
      };
    } catch (e) { L.fail(e); }
  }
  async function excel() {
    try {
      var rows = await L.fetchAll(function () { return query(); });
      await L.saveXlsx([{ name: 'Barcodes', widths: [12, 60, 14, 16, 16], head: ['Lucas PN', 'Description', 'Range', 'Barcode', 'Check'],
        rows: rows.map(function (p) { return [p.lucas_pn, p.short_desc, p.subcategory, p.barcode || '', p.barcode ? (L.ean13Valid(p.barcode) ? 'Valid EAN-13' : 'Check digit wrong') : 'Missing']; }) }], 'Lucas_barcodes_' + L.today() + '.xlsx');
    } catch (e) { L.fail(e); }
  }

  L.register({
    key: 'barcodes', name: 'Barcodes', color: '#6b4c9a',
    icon: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14"/>',
    menus: [{ label: 'Overview', href: BASE }, { label: 'Parts', href: L.href('barcodes', ['parts']) }],
    route: function (r) { if (r.parts[0] === 'parts') parts(r); else overview(); }
  });
})(window.LS);
