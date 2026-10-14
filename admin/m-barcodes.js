/* Module 5: Barcodes. Coverage, existing barcodes drawn and checked (EAN-13); generation rules plug into LS.barcodeRule */
(function (L) {
  'use strict';
  var $ = L.$, esc = L.esc, sb = L.sb, st = { page: 0, sel: {} };

  /* ===== barcode rules: to be provided by the data team =====
     Receives the part { lucas_pn, subcategory, short_desc, ... } and the list of barcodes already in use;
     returns the new 13-digit barcode as a string, or null while no rule is defined. */
  L.barcodeRule = function (part, used) {   // eslint-disable-line no-unused-vars
    return null;
  };

  // ---------- EAN-13: check digit and drawing ----------
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
    var bits = '101', p = PAR[Number(code[0])];
    for (var i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? LC : GC)[Number(code[i])];
    bits += '01010';
    for (i = 7; i <= 12; i++) bits += RC[Number(code[i])];
    bits += '101';
    var x = 9, bars = '';
    for (i = 0; i < bits.length; i++) {
      if (bits[i] === '1') { var guard = i < 3 || (i >= 45 && i < 50) || i >= 92; bars += '<rect x="' + (x + i) + '" y="0" width="1" height="' + (guard ? h + 5 : h) + '"/>'; }
    }
    return '<svg class="ean" viewBox="0 0 113 ' + (h + 14) + '" role="img" aria-label="EAN-13 ' + code + '"><g fill="#111">' + bars + '</g>' +
      '<text x="4" y="' + (h + 12) + '" font-size="10" font-family="monospace">' + code[0] + '</text>' +
      '<text x="14" y="' + (h + 12) + '" font-size="10" font-family="monospace" textLength="40">' + code.slice(1, 7) + '</text>' +
      '<text x="60" y="' + (h + 12) + '" font-size="10" font-family="monospace" textLength="40">' + code.slice(7) + '</text></svg>';
  };

  async function coverage() {
    try {
      var rows = await L.fetchAll(function () { return sb.from('products').select('lucas_pn,subcategory,barcode,status').order('lucas_pn'); });
      var by = {}, tot = { n: 0, has: 0, bad: 0 };
      rows.forEach(function (p) { if (p.status !== 'Active') return; var b = by[p.subcategory] = by[p.subcategory] || { n: 0, has: 0, bad: 0 }; b.n++; if (p.barcode) { b.has++; if (!L.ean13Valid(p.barcode)) b.bad++; } });
      $('bcCoverage').innerHTML = '<thead><tr><th>Range</th><th class="num">Active parts</th><th class="num">With barcode</th><th class="num">Without barcode</th><th class="num">Check digit wrong</th></tr></thead><tbody>' +
        L.CATS.map(function (c) { var b = by[c.subcategory_key] || { n: 0, has: 0, bad: 0 }; tot.n += b.n; tot.has += b.has; tot.bad += b.bad;
          return '<tr><td>' + esc(c.name) + '</td><td class="num">' + b.n.toLocaleString() + '</td><td class="num">' + b.has.toLocaleString() + '</td><td class="num">' + (b.n - b.has ? '<span class="flag">' + (b.n - b.has).toLocaleString() + '</span>' : '0') + '</td><td class="num">' + (b.bad ? '<span class="flag">' + b.bad + '</span>' : '0') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + tot.n.toLocaleString() + '</td><td class="num">' + tot.has.toLocaleString() + '</td><td class="num">' + (tot.n - tot.has).toLocaleString() + '</td><td class="num">' + tot.bad + '</td></tr></tfoot>';
    } catch (e) { L.fail(e); }
  }

  function query(opts) {
    var q = L.sb.from('products').select('lucas_pn,short_desc,subcategory,barcode,barcode_old,status', opts).eq('status', 'Active');
    if ($('bcRange').value) q = q.eq('subcategory', $('bcRange').value);
    if ($('bcFilter').value === 'missing') q = q.is('barcode', null);
    if ($('bcFilter').value === 'has') q = q.not('barcode', 'is', null);
    var s = L.orSearch(['lucas_pn', 'short_desc', 'barcode'], $('bcSearch').value); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }
  async function load(page) {
    if (page != null) st.page = page;
    try {
      var res = await query({ count: 'exact' }).range(st.page * L.PAGE, st.page * L.PAGE + L.PAGE - 1), rows = L.must(res);
      $('bcInfo').textContent = (res.count || 0).toLocaleString() + ' parts. ' + (L.isEditor() ? 'Tick parts and use "Generate barcodes for selected" once the rules are in place.' : '');
      if (!rows.length) { $('bcTable').innerHTML = '<tbody><tr><td class="empty">No parts.</td></tr></tbody>'; $('bcPager').innerHTML = ''; return; }
      $('bcTable').innerHTML = '<thead><tr><th class="editor-only"><input type="checkbox" id="bcAll"></th><th>Lucas PN</th><th>Description</th><th>Range</th><th>Barcode</th><th>Check</th><th></th></tr></thead><tbody>' +
        rows.map(function (p) {
          var ok = p.barcode ? L.ean13Valid(p.barcode) : null;
          return '<tr><td class="editor-only"><input type="checkbox" data-pn="' + esc(p.lucas_pn) + '"' + (st.sel[p.lucas_pn] ? ' checked' : '') + '></td><td class="pn">' + esc(p.lucas_pn) + '</td><td class="clip">' + esc(p.short_desc) + '</td><td>' + esc(p.subcategory) +
            '</td><td>' + esc(p.barcode || '') + '</td><td>' + (ok === null ? '' : ok ? '<span class="pill Won">Valid EAN-13</span>' : '<span class="flag">Check digit wrong</span>') + '</td><td>' + (ok ? L.ean13Svg(p.barcode, 22) : '') + '</td></tr>';
        }).join('') + '</tbody>';
      L.pager($('bcPager'), st.page, res.count || rows.length, load);
    } catch (e) { L.fail(e); }
  }
  function updateGen() { var n = Object.keys(st.sel).length; $('bcGen').disabled = !n; $('bcGen').textContent = n ? 'Generate barcodes for ' + n + ' selected' : 'Generate barcodes for selected'; }

  async function generate() {
    var pns = Object.keys(st.sel); if (!pns.length) return;
    try {
      var used = (await L.fetchAll(function () { return sb.from('products').select('barcode').not('barcode', 'is', null).order('barcode'); })).map(function (r) { return r.barcode; });
      var parts = []; for (var ch of L.chunks(pns, 300)) parts = parts.concat(L.must(await sb.from('products').select('*').in('lucas_pn', ch)));
      var out = parts.map(function (p) { var code = L.barcodeRule(p, used); if (code) used.push(code); return { p: p, code: code }; });
      var ready = out.filter(function (o) { return o.code; });
      L.drawer('<h1>Generate barcodes</h1>' + (!ready.length
        ? '<div class="notice"><b>Barcode rules not set yet.</b> ' + pns.length + ' parts selected. Once the data team provides the rules, the new barcodes are shown here for review before they are saved.</div>'
        : '<p>' + ready.length + ' of ' + pns.length + ' parts get a new barcode. Review, then save.</p><div class="tablewrap"><table class="grid"><thead><tr><th>Lucas PN</th><th>Description</th><th>Current</th><th>New</th><th></th></tr></thead><tbody>' +
          out.map(function (o) { return '<tr><td class="pn">' + esc(o.p.lucas_pn) + '</td><td class="clip">' + esc(o.p.short_desc) + '</td><td>' + esc(o.p.barcode || '') + '</td><td>' + esc(o.code || '') + (o.code && !L.ean13Valid(o.code) ? ' <span class="flag">invalid</span>' : '') + '</td><td>' + (o.code ? L.ean13Svg(o.code, 22) : '') + '</td></tr>'; }).join('') +
          '</tbody></table></div><div class="actions"><button class="btn" id="bcSave">Save ' + ready.length + ' barcodes</button></div>'));
      if (ready.length) $('bcSave').onclick = async function () {
        this.disabled = true;
        try {
          for (var o of ready) L.must(await sb.from('products').update({ barcode: o.code, barcode_old: o.p.barcode || o.p.barcode_old || null }).eq('lucas_pn', o.p.lucas_pn));
          L.toast('Saved ' + ready.length + ' barcodes'); st.sel = {}; updateGen(); L.closeDrawer(); load(); coverage();
        } catch (e) { L.fail(e); this.disabled = false; }
      };
    } catch (e) { L.fail(e); }
  }

  async function excel() {
    try {
      var rows = await L.fetchAll(function () { return query(); });
      await L.saveXlsx([{ name: 'Barcodes', widths: [12, 60, 14, 16, 16], head: ['Lucas PN', 'Description', 'Range', 'Barcode', 'Check'],
        rows: rows.map(function (p) { return [p.lucas_pn, p.short_desc, p.subcategory, p.barcode || '', p.barcode ? (L.ean13Valid(p.barcode) ? 'Valid EAN-13' : 'Check digit wrong') : 'Missing']; }) }],
        'Lucas_barcodes_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    } catch (e) { L.fail(e); }
  }

  L.modules.barcodes = {
    init: function () {
      $('bcRange').innerHTML = L.rangeOptions(true);
      $('bcSearch').addEventListener('input', L.debounce(function () { load(0); }));
      ['bcRange', 'bcFilter'].forEach(function (id) { $(id).addEventListener('change', function () { load(0); }); });
      $('bcTable').addEventListener('change', function (e) {
        if (e.target.id === 'bcAll') { document.querySelectorAll('#bcTable tbody input[data-pn]').forEach(function (c) { c.checked = e.target.checked; if (c.checked) st.sel[c.dataset.pn] = 1; else delete st.sel[c.dataset.pn]; }); }
        else if (e.target.dataset.pn) { if (e.target.checked) st.sel[e.target.dataset.pn] = 1; else delete st.sel[e.target.dataset.pn]; }
        updateGen();
      });
      $('bcGen').addEventListener('click', generate);
      $('bcXls').addEventListener('click', excel);
      coverage(); load(0);
    },
    show: function () { coverage(); }
  };
})(window.LS);
