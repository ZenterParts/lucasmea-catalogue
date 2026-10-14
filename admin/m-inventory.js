/* Module 6: Inventory. Stock per part and warehouse; everyone views and downloads, the data team uploads and edits */
(function (L) {
  'use strict';
  var $ = L.$, esc = L.esc, sb = L.sb, st = { page: 0 };

  function query(opts) {
    var q = sb.from('inventory_summary').select('*', opts);
    if ($('ivRange').value) q = q.eq('subcategory', $('ivRange').value);
    if ($('ivStock').value === 'in') q = q.gt('on_hand', 0);
    if ($('ivStock').value === 'none') q = q.lte('on_hand', 0);
    var s = L.orSearch(['lucas_pn', 'description'], $('ivSearch').value); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }
  async function chips() {
    try {
      var r = await Promise.all([sb.from('inventory').select('lucas_pn', { count: 'exact', head: true }), sb.from('inventory_summary').select('lucas_pn', { count: 'exact', head: true }).gt('on_hand', 0)]);
      $('ivChips').innerHTML = '<span class="chip static">' + (r[1].count || 0).toLocaleString() + ' parts in stock</span><span class="chip static">' + (r[0].count || 0).toLocaleString() + ' stock lines (part × warehouse)</span>';
    } catch (e) { /* informative only */ }
  }
  async function load(page) {
    if (page != null) st.page = page;
    try {
      var res = await query({ count: 'exact' }).range(st.page * L.PAGE, st.page * L.PAGE + L.PAGE - 1), rows = L.must(res);
      if (!rows.length) {
        $('ivTable').innerHTML = '<tbody><tr><td class="empty">' + ($('ivStock').value === 'in' ? 'No stock recorded yet. ' + (L.isEditor() ? 'Download the stock template, fill in quantities per warehouse and upload it.' : 'The data team uploads stock here.') : 'No parts found.') + '</td></tr></tbody>';
        $('ivPager').innerHTML = ''; return;
      }
      $('ivTable').innerHTML = '<thead><tr><th>Lucas PN</th><th>Description</th><th>Range</th><th class="num">On hand</th><th class="num">Reserved</th><th class="num">Available</th><th>By warehouse</th><th>Last updated</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr class="click" data-pn="' + esc(r.lucas_pn) + '"><td class="pn">' + esc(r.lucas_pn) + '</td><td class="clip">' + esc(r.description) + '</td><td>' + esc(r.subcategory) + '</td><td class="num">' + L.qty(r.on_hand) + '</td><td class="num">' + L.qty(r.reserved) + '</td><td class="num"><b>' + L.qty(r.available) + '</b></td><td class="clip small">' + esc(r.by_warehouse || '') + '</td><td class="small">' + esc(L.dt(r.last_updated)) + '</td></tr>'; }).join('') + '</tbody>';
      L.pager($('ivPager'), st.page, res.count || rows.length, load);
    } catch (e) { L.fail(e); }
  }

  async function openStock(pn) {
    try {
      var r = await Promise.all([sb.from('products').select('lucas_pn,short_desc,subcategory').eq('lucas_pn', pn).single(), sb.from('inventory').select('*').eq('lucas_pn', pn).order('warehouse')]);
      var p = L.must(r[0]), rows = L.must(r[1]), ed = L.isEditor();
      var line = function (s) { s = s || {}; return '<tr data-id="' + (s.id || '') + '"><td><input data-f="warehouse" value="' + esc(s.warehouse || '') + '"' + (ed ? '' : ' readonly') + '></td><td><input data-f="bin" value="' + esc(s.bin || '') + '"' + (ed ? '' : ' readonly') + '></td>' +
        '<td><input data-f="qty_on_hand" inputmode="decimal" value="' + esc(s.qty_on_hand == null ? '' : s.qty_on_hand) + '"' + (ed ? '' : ' readonly') + '></td><td><input data-f="qty_reserved" inputmode="decimal" value="' + esc(s.qty_reserved == null ? '' : s.qty_reserved) + '"' + (ed ? '' : ' readonly') + '></td>' +
        '<td class="small">' + esc(s.updated_by ? L.dt(s.updated_at) + ' · ' + s.updated_by : '') + '</td><td class="editor-only"><button class="link" data-del>Remove</button></td></tr>'; };
      L.drawer('<h1>' + esc(p.lucas_pn) + '</h1><p class="muted">' + esc(p.short_desc) + ' · ' + esc(p.subcategory) + '</p><h3>Stock by warehouse</h3>' +
        '<table class="grid compact" id="stTable"><thead><tr><th>Warehouse</th><th>Bin</th><th>On hand</th><th>Reserved</th><th>Updated</th><th class="editor-only"></th></tr></thead><tbody>' + (rows.length ? rows.map(line).join('') : (ed ? line({ warehouse: 'Main' }) : '<tr><td colspan="5" class="empty">No stock recorded.</td></tr>')) + '</tbody></table>' +
        '<div class="actions editor-only"><button class="btn ghost" id="stAdd">+ Warehouse</button><button class="btn" id="stSave">Save stock</button><button class="btn ghost" id="stPart">Open part</button></div>' +
        (ed ? '' : '<div class="actions"><button class="btn ghost" id="stPart">Open part</button></div>'));
      $('stPart').onclick = function () { L.openPart(pn); };
      if (!ed) return;
      $('stAdd').onclick = function () { $('stTable').tBodies[0].insertAdjacentHTML('beforeend', line({})); };
      var removed = [];
      $('stTable').onclick = function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var tr = b.closest('tr'); if (tr.dataset.id) removed.push(Number(tr.dataset.id)); tr.remove(); };
      $('stSave').onclick = async function () {
        try {
          var trs = Array.from($('stTable').tBodies[0].rows), up = [];
          trs.forEach(function (tr) {
            var g = function (f) { return tr.querySelector('[data-f="' + f + '"]').value.trim(); };
            if (!g('warehouse')) return;
            var oh = L.num(g('qty_on_hand')) || 0, rs = L.num(g('qty_reserved')) || 0;
            if (Number.isNaN(oh) || Number.isNaN(rs)) throw new Error('Quantities must be numbers');
            up.push({ lucas_pn: pn, warehouse: g('warehouse'), bin: g('bin') || null, qty_on_hand: oh, qty_reserved: rs });
          });
          if (removed.length) L.must(await sb.from('inventory').delete().in('id', removed));
          if (up.length) L.must(await sb.from('inventory').upsert(up, { onConflict: 'lucas_pn,warehouse' }));
          L.toast('Stock saved for ' + pn); load(); chips(); openStock(pn);
        } catch (e) { L.fail(e); }
      };
    } catch (e) { L.fail(e); }
  }

  async function excel() {
    try {
      L.toast('Preparing stock list…');
      var rows = await L.fetchAll(function () { return query(); });
      var lines = await L.fetchAll(function () { return sb.from('inventory').select('lucas_pn,warehouse,bin,qty_on_hand,qty_reserved,updated_at').order('lucas_pn'); });
      await L.saveXlsx([
        { name: 'Stock by part', widths: [12, 60, 14, 10, 10, 10, 40], head: ['Lucas PN', 'Description', 'Range', 'On hand', 'Reserved', 'Available', 'By warehouse'],
          rows: rows.map(function (r) { return [r.lucas_pn, r.description, r.subcategory, Number(r.on_hand), Number(r.reserved), Number(r.available), r.by_warehouse || '']; }) },
        { name: 'Stock lines', widths: [12, 16, 10, 10, 10, 18], head: ['Lucas PN', 'Warehouse', 'Bin', 'On hand', 'Reserved', 'Updated'],
          rows: lines.map(function (s) { return [s.lucas_pn, s.warehouse, s.bin || '', Number(s.qty_on_hand), Number(s.qty_reserved), L.dt(s.updated_at)]; }) }
      ], 'Lucas_stock_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    } catch (e) { L.fail(e); }
  }
  async function template() {
    try {
      var sub = $('ivRange').value;
      var parts = await L.fetchAll(function () { var q = sb.from('products').select('lucas_pn,short_desc,subcategory').eq('status', 'Active').order('lucas_pn'); return sub ? q.eq('subcategory', sub) : q; });
      await L.saveXlsx([{ name: 'Stock', widths: [12, 60, 14, 14, 10, 10, 10], head: ['Lucas PN', 'Description', 'Range', 'Warehouse', 'Bin', 'On hand', 'Reserved'],
        rows: parts.map(function (p) { return [p.lucas_pn, p.short_desc, p.subcategory, 'Main', '', '', '']; }) }], 'Lucas_stock_template' + (sub ? '_' + sub.replace(/\s+/g, '_') : '') + '.xlsx');
    } catch (e) { L.fail(e); }
  }
  async function upload(f) {
    L.drawer('<h1>Upload stock</h1><p class="muted">Reading ' + esc(f.name) + '…</p>');
    try {
      var raw = await L.readSheet(f), bad = [];
      var rows = raw.map(function (o, i) {
        return { line: i + 2, lucas_pn: L.clean(L.pick(o, L.PN_COLS)), warehouse: L.pick(o, ['warehouse', 'location', 'store', 'site']) || 'Main', bin: L.pick(o, ['bin', 'binlocation', 'shelf']),
          oh: L.num(L.pick(o, ['onhand', 'qtyonhand', 'stock', 'qty', 'quantity'])), rs: L.num(L.pick(o, ['reserved', 'qtyreserved', 'allocated'])) };
      }).filter(function (r) { return r.lucas_pn && (r.oh != null || r.rs != null); });
      if (!rows.length) return L.drawer('<h1>Upload stock</h1><p class="flag">No rows with a Lucas PN and a quantity were found. Columns: "Lucas PN", "Warehouse", "On hand" (optional "Reserved", "Bin").</p>');
      rows.forEach(function (r) { if (Number.isNaN(r.oh) || Number.isNaN(r.rs)) bad.push('Row ' + r.line + ' (' + r.lucas_pn + '): quantity is not a number'); });
      var known = {}, cur = {};
      for (var ch of L.chunks(Array.from(new Set(rows.map(function (r) { return r.lucas_pn; }))), 300)) {
        L.must(await sb.from('products').select('lucas_pn').in('lucas_pn', ch)).forEach(function (p) { known[p.lucas_pn] = 1; });
        L.must(await sb.from('inventory').select('lucas_pn,warehouse,qty_on_hand,qty_reserved,bin').in('lucas_pn', ch)).forEach(function (s) { cur[s.lucas_pn + '|' + s.warehouse] = s; });
      }
      var unknown = rows.filter(function (r) { return !known[r.lucas_pn]; });
      var ok = rows.filter(function (r) { return known[r.lucas_pn] && !Number.isNaN(r.oh) && !Number.isNaN(r.rs); });
      var changed = ok.filter(function (r) { var c = cur[r.lucas_pn + '|' + r.warehouse]; return !c || (r.oh != null && Number(c.qty_on_hand) !== r.oh) || (r.rs != null && Number(c.qty_reserved) !== r.rs) || (r.bin && r.bin !== c.bin); });
      L.drawer('<h1>Upload stock</h1><p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows, <b>' + changed.length + '</b> stock lines will change' + (unknown.length ? ', <span class="flag">' + unknown.length + ' part numbers not in the database (skipped)</span>' : '') + '. Parts and warehouses not in the file are left as they are.</p>' +
        (bad.length ? '<p class="flag">Fix these first:</p><ul>' + bad.slice(0, 30).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        (changed.length ? '<div class="tablewrap" style="max-height:50vh"><table class="grid"><thead><tr><th>Lucas PN</th><th>Warehouse</th><th class="num">On hand now</th><th class="num">On hand new</th><th class="num">Reserved now</th><th class="num">Reserved new</th></tr></thead><tbody>' +
          changed.slice(0, 300).map(function (r) { var c = cur[r.lucas_pn + '|' + r.warehouse] || {}; return '<tr><td class="pn">' + esc(r.lucas_pn) + '</td><td>' + esc(r.warehouse) + '</td><td class="num">' + L.qty(c.qty_on_hand) + '</td><td class="num"><b>' + L.qty(r.oh != null ? r.oh : c.qty_on_hand) + '</b></td><td class="num">' + L.qty(c.qty_reserved) + '</td><td class="num">' + L.qty(r.rs != null ? r.rs : c.qty_reserved) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '') +
        '<div class="actions"><button class="btn" id="ivApply"' + (bad.length || !changed.length ? ' disabled' : '') + '>Update ' + changed.length + ' stock lines</button></div>');
      $('ivApply').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Updating…';
        try {
          var up = changed.map(function (r) { var c = cur[r.lucas_pn + '|' + r.warehouse] || {};
            return { lucas_pn: r.lucas_pn, warehouse: r.warehouse, bin: r.bin || c.bin || null, qty_on_hand: r.oh != null ? r.oh : (c.qty_on_hand || 0), qty_reserved: r.rs != null ? r.rs : (c.qty_reserved || 0) }; });
          for (var c of L.chunks(up, 500)) L.must(await sb.from('inventory').upsert(c, { onConflict: 'lucas_pn,warehouse' }));
          L.toast('Updated ' + up.length + ' stock lines'); L.closeDrawer(); load(0); chips();
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Try again'; }
      };
    } catch (e) { L.fail(e); }
  }

  L.modules.inventory = {
    init: function () {
      $('ivRange').innerHTML = L.rangeOptions(true);
      $('ivSearch').addEventListener('input', L.debounce(function () { load(0); }));
      ['ivRange', 'ivStock'].forEach(function (id) { $(id).addEventListener('change', function () { load(0); }); });
      $('ivTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-pn]'); if (tr) openStock(tr.dataset.pn); });
      $('ivXls').addEventListener('click', excel);
      $('ivTpl').addEventListener('click', template);
      $('ivUpload').addEventListener('click', function () { L.pickFile(upload); });
      chips(); load(0);
    },
    show: function () { chips(); load(); }
  };
})(window.LS);
