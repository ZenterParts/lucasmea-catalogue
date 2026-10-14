/* App: Inventory. Stock per part and warehouse; everyone views and downloads, the data team uploads and edits */
(function (L) {
  'use strict';
  var esc = L.esc, sb = L.sb, $ = L.$;
  var S = L.state.inv = { range: '', text: '', active: { st_in: true }, offset: 0 };
  var BASE = L.href('inventory');
  var FILTERS = [{ key: 'st_in', label: 'In stock', group: 'Stock', single: true }, { key: 'st_none', label: 'No stock', group: 'Stock', single: true }, { key: 'st_res', label: 'Has reservations', group: 'Stock', single: true }];

  function query(opts) {
    var q = sb.from('inventory_summary').select('*', opts);
    if (S.range) q = q.eq('subcategory', S.range);
    if (S.active.st_in) q = q.gt('on_hand', 0);
    if (S.active.st_none) q = q.lte('on_hand', 0);
    if (S.active.st_res) q = q.gt('reserved', 0);
    var s = L.orSearch(['lucas_pn', 'description'], S.text); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }
  function list(r) {
    if (r.q.range != null) { S.range = r.q.range === 'all' ? '' : r.q.range; S.offset = 0; }
    L.cp({ crumbs: [['Inventory', BASE], [S.range ? (L.cat(S.range) || {}).name || S.range : 'Stock']], buttons: '<button type="button" class="btn editor-only" id="ivUp">Upload stock</button><button type="button" class="btn ghost" id="ivXls">Download</button>' });
    L.searchBar({ placeholder: 'Search part no. or description…', text: S.text, filters: FILTERS, active: S.active, onChange: function (s) { S.text = s.text; S.active = s.active; S.offset = 0; load(); } });
    L.content('<div class="cards" id="ivStats" style="margin-bottom:14px"></div><div class="o-with-panel"><nav class="o-panel"><div class="o-panel-title">Range</div><a href="' + L.href('inventory', [], { range: 'all' }) + '" class="' + (!S.range ? 'on' : '') + '">All ranges</a>' +
      L.CATS.map(function (x) { return '<a href="' + L.href('inventory', [], { range: x.subcategory_key }) + '" class="' + (x.subcategory_key === S.range ? 'on' : '') + '">' + esc(x.name) + '</a>'; }).join('') + '</nav><div id="ivList"></div></div>');
    $('ivUp').onclick = function () { L.pickFile(upload); };
    $('ivXls').onclick = excel;
    stats(); load();
  }
  async function stats() {
    try {
      var r = await Promise.all([sb.from('inventory_summary').select('lucas_pn', { count: 'exact', head: true }).gt('on_hand', 0), sb.from('inventory').select('lucas_pn', { count: 'exact', head: true }),
        sb.from('inventory_summary').select('lucas_pn', { count: 'exact', head: true }).gt('reserved', 0), sb.from('inventory').select('warehouse').limit(1000)]);
      var wh = Array.from(new Set((r[3].data || []).map(function (x) { return x.warehouse; })));
      $('ivStats').innerHTML = [[r[0].count || 0, 'parts in stock'], [r[1].count || 0, 'stock lines (part × warehouse)'], [r[2].count || 0, 'parts with reservations'], [wh.length, 'warehouses' + (wh.length ? ': ' + wh.slice(0, 4).join(', ') : '')]]
        .map(function (s) { return '<div class="card"><div class="stat">' + Number(s[0]).toLocaleString() + '</div><div class="stat-l">' + esc(s[1]) + '</div></div>'; }).join('');
    } catch (e) { /* informative only */ }
  }
  async function load() {
    try {
      var res = await query({ count: 'exact' }).range(S.offset, S.offset + L.PAGE - 1), rows = L.must(res);
      L.pager(S.offset, res.count || 0, function (o) { S.offset = o; load(); });
      if (!rows.length) { $('ivList').innerHTML = L.empty(S.active.st_in ? 'No stock recorded yet' : 'No parts', S.active.st_in ? (L.isEditor() ? 'Download the template (Data › Stock template), fill in quantities per warehouse, then use "Upload stock".' : 'The data team uploads stock here.') : 'Nothing matches.'); return; }
      $('ivList').innerHTML = L.listView([
        { label: 'Lucas PN', cls: 'pn', render: function (x) { return esc(x.lucas_pn); } }, { label: 'Description', cls: 'clip', render: function (x) { return esc(x.description); } }, { label: 'Range', render: function (x) { return esc(x.subcategory); } },
        { label: 'On hand', num: true, render: function (x) { return L.qty(x.on_hand); } }, { label: 'Reserved', num: true, render: function (x) { return L.qty(x.reserved); } }, { label: 'Available', num: true, render: function (x) { return '<b>' + L.qty(x.available) + '</b>'; } },
        { label: 'By warehouse', cls: 'clip', render: function (x) { return esc(x.by_warehouse || ''); } }, { label: 'Last updated', render: function (x) { return '<span class="small">' + esc(L.dt(x.last_updated)) + '</span>'; } }
      ], rows, function (x) { return L.href('inventory', [x.lucas_pn]); });
    } catch (e) { L.fail(e); }
  }

  async function form(pn) {
    try {
      var r = await Promise.all([sb.from('products').select('lucas_pn,short_desc,subcategory,status').eq('lucas_pn', pn).maybeSingle(), sb.from('inventory').select('*').eq('lucas_pn', pn).order('warehouse')]);
      var p = L.must(r[0]), rows = L.must(r[1]), ed = L.isEditor();
      if (!p) { L.cp({ crumbs: [['Inventory', BASE], [pn]] }); return L.content(L.empty('Part not found', esc(pn) + ' is not in the database.')); }
      var tot = rows.reduce(function (a, s) { a.oh += Number(s.qty_on_hand); a.rs += Number(s.qty_reserved); return a; }, { oh: 0, rs: 0 });
      var line = function (s) { s = s || {}; var ro = ed ? '' : ' readonly';
        return '<tr data-id="' + (s.id || '') + '"><td><input data-f="warehouse" value="' + esc(s.warehouse || '') + '"' + ro + '></td><td><input data-f="bin" value="' + esc(s.bin || '') + '"' + ro + '></td><td><input data-f="qty_on_hand" inputmode="decimal" value="' + esc(s.qty_on_hand == null ? '' : s.qty_on_hand) + '"' + ro + '></td>' +
          '<td><input data-f="qty_reserved" inputmode="decimal" value="' + esc(s.qty_reserved == null ? '' : s.qty_reserved) + '"' + ro + '></td><td class="small">' + esc(s.updated_by ? L.dt(s.updated_at) + ' · ' + s.updated_by : '') + '</td><td class="editor-only"><button class="link" data-del>Remove</button></td></tr>'; };
      L.form({
        crumbs: [['Inventory', BASE], [p.lucas_pn]],
        buttons: '<button type="button" class="btn editor-only" id="stSave">Save</button><button type="button" class="btn ghost editor-only" id="stDiscard">Discard</button>',
        actions: '<a class="btn ghost" href="' + L.href('parts', ['p', pn]) + '">Open part</a>',
        sheet: '<div class="o-title"><h1>' + esc(p.lucas_pn) + '</h1>' + L.pill(p.status) + '</div><div class="o-subtitle">' + esc(p.short_desc) + ' · ' + esc(p.subcategory) + '</div>' +
          '<div class="o-groups">' + L.group('Totals', [['On hand', L.qty(tot.oh)], ['Reserved', L.qty(tot.rs)], ['Available', '<b>' + L.qty(tot.oh - tot.rs) + '</b>']]) + L.group('', []) + '</div>' +
          L.notebook([{ key: 'wh', label: 'Stock by warehouse', html: '<table class="grid compact" id="stTable"><thead><tr><th>Warehouse</th><th>Bin</th><th>On hand</th><th>Reserved</th><th>Updated</th><th class="editor-only"></th></tr></thead><tbody>' +
            (rows.length ? rows.map(line).join('') : ed ? line({ warehouse: 'Main' }) : '<tr><td colspan="5" class="muted">No stock recorded.</td></tr>') + '</tbody></table><div class="editor-only o-footer"><button type="button" class="btn ghost small" id="stAdd">+ Add a warehouse</button></div>' }])
      });
      if (!ed) return;
      var removed = [];
      $('stDiscard').onclick = function () { form(pn); };
      $('stAdd').onclick = function () { $('stTable').tBodies[0].insertAdjacentHTML('beforeend', line({})); };
      $('stTable').onclick = function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var tr = b.closest('tr'); if (tr.dataset.id) removed.push(Number(tr.dataset.id)); tr.remove(); };
      $('stSave').onclick = async function () {
        try {
          var up = [];
          Array.from($('stTable').tBodies[0].rows).forEach(function (tr) {
            var g = function (f) { var i = tr.querySelector('[data-f="' + f + '"]'); return i ? i.value.trim() : ''; };
            if (!g('warehouse')) return;
            var oh = L.num(g('qty_on_hand')), rs = L.num(g('qty_reserved'));
            if (Number.isNaN(oh) || Number.isNaN(rs)) throw new Error('Quantities must be numbers');
            up.push({ lucas_pn: pn, warehouse: g('warehouse'), bin: g('bin') || null, qty_on_hand: oh || 0, qty_reserved: rs || 0 });
          });
          if (removed.length) L.must(await sb.from('inventory').delete().in('id', removed));
          if (up.length) L.must(await sb.from('inventory').upsert(up, { onConflict: 'lucas_pn,warehouse' }));
          L.toast('Stock saved for ' + pn); form(pn);
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
        { name: 'Stock by part', widths: [12, 60, 14, 10, 10, 10, 40], head: ['Lucas PN', 'Description', 'Range', 'On hand', 'Reserved', 'Available', 'By warehouse'], rows: rows.map(function (x) { return [x.lucas_pn, x.description, x.subcategory, Number(x.on_hand), Number(x.reserved), Number(x.available), x.by_warehouse || '']; }) },
        { name: 'Stock lines', widths: [12, 16, 10, 10, 10, 18], head: ['Lucas PN', 'Warehouse', 'Bin', 'On hand', 'Reserved', 'Updated'], rows: lines.map(function (s) { return [s.lucas_pn, s.warehouse, s.bin || '', Number(s.qty_on_hand), Number(s.qty_reserved), L.dt(s.updated_at)]; }) }
      ], 'Lucas_stock_' + L.today() + '.xlsx');
    } catch (e) { L.fail(e); }
  }
  async function template() {
    try {
      var parts = await L.fetchAll(function () { var q = sb.from('products').select('lucas_pn,short_desc,subcategory').eq('status', 'Active').order('lucas_pn'); return S.range ? q.eq('subcategory', S.range) : q; });
      await L.saveXlsx([{ name: 'Stock', widths: [12, 60, 14, 14, 10, 10, 10], head: ['Lucas PN', 'Description', 'Range', 'Warehouse', 'Bin', 'On hand', 'Reserved'], rows: parts.map(function (p) { return [p.lucas_pn, p.short_desc, p.subcategory, 'Main', '', '', '']; }) }],
        'Lucas_stock_template' + (S.range ? '_' + S.range.replace(/\s+/g, '_') : '') + '.xlsx');
    } catch (e) { L.fail(e); }
  }
  async function upload(f) {
    L.modal('Upload stock', '<p class="muted">Reading ' + esc(f.name) + '…</p>', true);
    try {
      var raw = await L.readSheet(f), bad = [];
      var rows = raw.map(function (o, i) {
        return { line: i + 2, lucas_pn: L.clean(L.pick(o, L.PN_COLS)), warehouse: L.pick(o, ['warehouse', 'location', 'store', 'site']) || 'Main', bin: L.pick(o, ['bin', 'binlocation', 'shelf']),
          oh: L.num(L.pick(o, ['onhand', 'qtyonhand', 'stock', 'qty', 'quantity'])), rs: L.num(L.pick(o, ['reserved', 'qtyreserved', 'allocated'])) };
      }).filter(function (r) { return r.lucas_pn && (r.oh != null || r.rs != null); });
      if (!rows.length) return L.modal('Upload stock', '<p class="flag">No rows with a Lucas PN and a quantity were found. Columns: "Lucas PN", "Warehouse", "On hand" (optional "Reserved", "Bin").</p>');
      rows.forEach(function (r) { if (Number.isNaN(r.oh) || Number.isNaN(r.rs)) bad.push('Row ' + r.line + ' (' + r.lucas_pn + '): quantity is not a number'); });
      var known = {}, cur = {};
      for (var ch of L.chunks(Array.from(new Set(rows.map(function (r) { return r.lucas_pn; }))), 300)) {
        L.must(await sb.from('products').select('lucas_pn').in('lucas_pn', ch)).forEach(function (p) { known[p.lucas_pn] = 1; });
        L.must(await sb.from('inventory').select('lucas_pn,warehouse,qty_on_hand,qty_reserved,bin').in('lucas_pn', ch)).forEach(function (s) { cur[s.lucas_pn + '|' + s.warehouse] = s; });
      }
      var unknown = rows.filter(function (r) { return !known[r.lucas_pn]; });
      var ok = rows.filter(function (r) { return known[r.lucas_pn] && !Number.isNaN(r.oh) && !Number.isNaN(r.rs); });
      var changed = ok.filter(function (r) { var c = cur[r.lucas_pn + '|' + r.warehouse]; return !c || (r.oh != null && Number(c.qty_on_hand) !== r.oh) || (r.rs != null && Number(c.qty_reserved) !== r.rs) || (r.bin && r.bin !== c.bin); });
      L.modal('Upload stock', '<p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows, <b>' + changed.length + '</b> stock lines will change' + (unknown.length ? ', <span class="flag">' + unknown.length + ' part numbers not in the database (skipped)</span>' : '') + '. Parts and warehouses not in the file stay as they are.</p>' +
        (bad.length ? '<div class="notice bad"><b>Fix these first:</b><ul>' + bad.slice(0, 30).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>' : '') +
        (changed.length ? '<div class="o-list"><table class="grid"><thead><tr><th>Lucas PN</th><th>Warehouse</th><th class="num">On hand now</th><th class="num">On hand new</th><th class="num">Reserved now</th><th class="num">Reserved new</th></tr></thead><tbody>' +
          changed.slice(0, 300).map(function (r) { var c = cur[r.lucas_pn + '|' + r.warehouse] || {}; return '<tr><td class="pn">' + esc(r.lucas_pn) + '</td><td>' + esc(r.warehouse) + '</td><td class="num">' + L.qty(c.qty_on_hand) + '</td><td class="num"><b>' + L.qty(r.oh != null ? r.oh : c.qty_on_hand) + '</b></td><td class="num">' + L.qty(c.qty_reserved) + '</td><td class="num">' + L.qty(r.rs != null ? r.rs : c.qty_reserved) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<div class="o-footer"><button class="btn" id="ivApply"' + (bad.length || !changed.length ? ' disabled' : '') + '>Update ' + changed.length + ' stock lines</button><button class="btn ghost" id="ivX">Cancel</button></div>', true);
      $('ivX').onclick = L.closeModal;
      $('ivApply').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Updating…';
        try {
          var up = changed.map(function (r) { var c = cur[r.lucas_pn + '|' + r.warehouse] || {}; return { lucas_pn: r.lucas_pn, warehouse: r.warehouse, bin: r.bin || c.bin || null, qty_on_hand: r.oh != null ? r.oh : (c.qty_on_hand || 0), qty_reserved: r.rs != null ? r.rs : (c.qty_reserved || 0) }; });
          for (var c of L.chunks(up, 500)) L.must(await sb.from('inventory').upsert(c, { onConflict: 'lucas_pn,warehouse' }));
          L.closeModal(); L.toast('Updated ' + up.length + ' stock lines'); L.render();
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Try again'; }
      };
    } catch (e) { L.fail(e); }
  }

  L.register({
    key: 'inventory', name: 'Inventory', color: '#c0392b',
    icon: '<path d="M3 9l9-5 9 5v10H3z"/><path d="M7 19v-6h10v6M7 16h10"/>',
    menus: [{ label: 'Stock', href: BASE }, { label: 'Data', editor: true, children: [{ label: 'Upload stock', action: 'up' }, { label: 'Stock template', action: 'tpl' }] }],
    actions: { up: function () { L.pickFile(upload); }, tpl: template },
    route: function (r) { if (r.parts[0]) form(r.parts[0]); else list(r); }
  });
})(window.LS);
