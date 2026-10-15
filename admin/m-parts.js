/* App: Parts & prices. Everyone views and downloads; the data team edits and uploads */
(function (L) {
  'use strict';
  var esc = L.esc, sb = L.sb, $ = L.$;
  var S = L.state.parts = { range: '', text: '', active: { st_Active: true }, offset: 0, counts: null };
  var BASE = L.href('parts');
  var FILTERS = [
    { key: 'st_Active', label: 'Active', group: 'Status', single: true }, { key: 'st_Inactive', label: 'Inactive', group: 'Status', single: true },
    { key: 'pr_with', label: 'With FOB price', group: 'Price', single: true }, { key: 'pr_without', label: 'Without FOB price', group: 'Price', single: true }
  ];

  function cat() { return L.cat(S.range) || L.CATS[0]; }
  function query(c, opts) {
    var q = sb.from(c.view_name).select('*', opts);
    if (S.active.st_Active) q = q.eq('status', 'Active');
    if (S.active.st_Inactive) q = q.eq('status', 'Inactive');
    if (S.active.pr_with) q = q.not('fob_usd', 'is', null);
    if (S.active.pr_without) q = q.is('fob_usd', null);
    var s = L.orSearch(c.view_name === 'bulbs_full' ? ['lucas_pn', 'description', 'supplier_pn'] : ['lucas_pn', 'description', 'oe_numbers', 'competitor_numbers'], S.text); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }

  // ---------- list with the range side panel ----------
  async function list(r) {
    if (r.q.range && L.cat(r.q.range)) { if (S.range !== r.q.range) S.offset = 0; S.range = r.q.range; }
    var c = cat(); S.range = c.subcategory_key;
    L.cp({ crumbs: [['Parts & prices', BASE], [c.name]],
      buttons: '<button type="button" class="btn editor-only" id="ptNew">New</button><button type="button" class="btn ghost" id="ptXls">Download</button>' });
    L.searchBar({ placeholder: 'Search part no., description, OE or competitor number…', text: S.text, filters: FILTERS, active: S.active, onChange: function (s) { S.text = s.text; S.active = s.active; S.offset = 0; load(); } });
    $('ptNew').onclick = function () { addPart(); };
    $('ptXls').onclick = exportRange;
    if (!S.counts) { try { S.counts = {}; L.must(await sb.from('category_overview').select('subcategory_key,item_count').eq('status', 'live')).forEach(function (x) { S.counts[x.subcategory_key] = x.item_count; }); } catch (e) { S.counts = null; } }
    L.content('<div class="o-with-panel"><nav class="o-panel"><div class="o-panel-title">Range</div>' + L.CATS.map(function (x) {
      return '<a href="' + L.href('parts', [], { range: x.subcategory_key }) + '" class="' + (x === c ? 'on' : '') + '">' + esc(x.name) + '<small>' + (S.counts && S.counts[x.subcategory_key] != null ? Number(S.counts[x.subcategory_key]).toLocaleString() : '') + '</small></a>';
    }).join('') + '</nav><div id="ptList"></div></div>');
    load();
  }
  async function load() {
    var c = cat();
    try {
      var res = await query(c, { count: 'exact' }).range(S.offset, S.offset + L.PAGE - 1), rows = L.must(res);
      L.pager(S.offset, res.count || 0, function (o) { S.offset = o; load(); });
      if (!rows.length) { $('ptList').innerHTML = L.empty('No parts', 'Nothing matches the search and filters.'); return; }
      var cols = Object.keys(rows[0]).filter(function (k) { return k !== 'fob_usd'; }); cols.splice(2, 0, 'fob_usd');
      $('ptList').innerHTML = L.listView(cols.map(function (k) { return { key: k, label: L.label(k), num: L.NUMCOLS.test(k) || L.PCTCOLS.test(k), render: L.NUMCOLS.test(k) || L.PCTCOLS.test(k) ? function (r) { return L.cell(k, r[k]).replace(/^<td[^>]*>|<\/td>$/g, ''); } : null }; }),
        rows, function (r) { return L.href('parts', ['p', r.lucas_pn]); });
    } catch (e) { L.fail(e); }
  }
  async function exportRange() {
    var c = cat(); L.toast('Preparing ' + c.name + '…');
    try {
      var rows = await L.fetchAll(function () { return query(c); });
      if (!rows.length) return L.toast('Nothing to download');
      var cols = Object.keys(rows[0]).filter(function (k) { return k !== 'fob_usd'; }); cols.splice(2, 0, 'fob_usd');
      await L.saveXlsx([{ name: c.name, head: cols.map(L.label), rows: rows.map(function (r) { return cols.map(function (k) { var v = r[k]; return v == null ? '' : (L.NUMCOLS.test(k) || L.PCTCOLS.test(k)) ? Number(v) : v; }); }) }],
        'Lucas_' + c.name.replace(/\s+/g, '_') + '_' + L.today() + '.xlsx');
    } catch (e) { L.fail(e); }
  }

  // ---------- part form ----------
  var GEN = [['short_desc', 'Description'], ['long_desc', 'Long description'], ['brand', 'Brand'], ['origin', 'Origin'], ['supplier_pn', 'Supplier PN'], ['zp_pn', 'ZP PN'], ['barcode', 'Barcode'], ['hs_code', 'HS code']];
  var PRICE = [['fob_usd', 'FOB USD'], ['exw_usd', 'EXW USD'], ['price_list', 'Price list']];
  var COST = [['pct_cons', 'Consolidation %'], ['pct_ship', 'Shipping %'], ['pct_ins', 'Insurance %'], ['pct_port', 'Port %'], ['pct_wh', 'Warehouse %'], ['min_retention', 'Min. retention %'], ['max_discount', 'Max. discount %']];
  var LISTS = {
    specs: { table: 'product_specs', cols: [['attribute', 'Attribute'], ['value', 'Value']], req: 'attribute' },
    oe: { table: 'oe_numbers', cols: [['oe_number', 'OE number'], ['oe_brand', 'Vehicle brand']], req: 'oe_number' },
    comp: { table: 'competitor_refs', cols: [['comp_brand', 'Brand'], ['comp_number', 'Number']], req: 'comp_number' }
  };
  function inp(id, v, attrs) { return '<input id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (L.isEditor() ? '' : ' readonly') + (attrs || '') + '>'; }
  function rowHtml(key, it) {
    return '<div class="row" data-id="' + esc(it.id || '') + '">' + LISTS[key].cols.map(function (c) { return '<input data-f="' + c[0] + '" placeholder="' + c[1] + '" value="' + esc(it[c[0]] == null ? '' : it[c[0]]) + '"' + (L.isEditor() ? '' : ' readonly') + '>'; }).join('') +
      '<button type="button" class="x editor-only" title="Remove">×</button></div>';
  }
  function rowsHtml(key, items) { return '<div class="rows" id="rows-' + key + '">' + items.map(function (it) { return rowHtml(key, it); }).join('') + '</div><button type="button" class="btn ghost small editor-only" data-add="' + key + '" style="margin-top:10px">+ Add a line</button>' + (items.length ? '' : '<p class="muted small viewer-note">None recorded.</p>'); }
  function readRows(key) {
    return Array.from(document.querySelectorAll('#rows-' + key + ' .row')).map(function (r) { var o = { id: r.dataset.id ? Number(r.dataset.id) : null }; LISTS[key].cols.forEach(function (c) { o[c[0]] = r.querySelector('[data-f="' + c[0] + '"]').value.trim(); }); return o; });
  }

  async function partForm(pn) {
    try {
      var r = await Promise.all([
        sb.from('products').select('*').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_pricing').select('*').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_prices').select('cost_zenter,rp_cif,net_cif,margin').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_specs').select('*').eq('lucas_pn', pn).order('id'),
        sb.from('oe_numbers').select('*').eq('lucas_pn', pn).order('id'),
        sb.from('competitor_refs').select('*').eq('lucas_pn', pn).order('comp_brand'),
        sb.from('applications').select('*', { count: 'exact' }).eq('lucas_pn', pn).order('make').order('model').limit(500),
        sb.from('spec_bulbs').select('*').eq('lucas_pn', pn).maybeSingle(),
        sb.from('inventory').select('*').eq('lucas_pn', pn).order('warehouse')
      ]);
      var p = L.must(r[0]);
      if (!p) { L.cp({ crumbs: [['Parts & prices', BASE], [pn]] }); return L.content(L.empty('Part not found', esc(pn) + ' is not in the database.')); }
      var pr = L.must(r[1]) || {}, calc = L.must(r[2]) || {}, specs = L.must(r[3]), oe = L.must(r[4]), comp = L.must(r[5]),
        apps = L.must(r[6]), appCount = r[6].count || apps.length, bulb = L.must(r[7]), stock = L.must(r[8]), ed = L.isEditor();
      var orig = { specs: specs, oe: oe, comp: comp }, c = L.cat(p.subcategory) || { name: p.subcategory };
      var bulbCols = bulb ? Object.keys(bulb).filter(function (k) { return k !== 'lucas_pn'; }) : [];
      var avail = stock.reduce(function (s, x) { return s + Number(x.qty_on_hand) - Number(x.qty_reserved); }, 0);
      var ean = p.barcode && L.ean13Valid && L.ean13Valid(p.barcode) ? L.ean13Svg(p.barcode, 24) : '';
      var tabs = [];
      if (bulb) tabs.push({ key: 'bulb', label: 'Bulb data', html: '<div class="o-groups">' + L.group('', bulbCols.map(function (k) { return [L.label(k), inp('b_' + k, bulb[k])]; })) + '</div>' });
      tabs.push({ key: 'specs', label: 'Specifications <span class="muted">(' + specs.length + ')</span>', html: rowsHtml('specs', specs) });
      tabs.push({ key: 'oe', label: 'OE numbers <span class="muted">(' + oe.length + ')</span>', html: rowsHtml('oe', oe) });
      tabs.push({ key: 'comp', label: 'Competitor numbers <span class="muted">(' + comp.length + ')</span>', html: rowsHtml('comp', comp) });
      tabs.push({ key: 'veh', label: 'Vehicles <span class="muted">(' + appCount + ')</span>', html:
        (appCount > apps.length ? '<p class="muted small">First ' + apps.length + ' of ' + appCount + ' shown.</p>' : '') +
        '<div class="o-list"><table class="grid" id="appsTable"><thead><tr><th>Make</th><th>Model</th><th>Variant</th><th>Engine</th><th>Fuel</th><th>Years</th><th>Position</th><th>Details</th><th class="editor-only"></th></tr></thead><tbody>' +
        apps.map(function (a) { return '<tr><td>' + esc(a.make) + '</td><td>' + esc(a.model) + '</td><td>' + esc(a.variant) + '</td><td>' + esc(a.engine_code) + '</td><td>' + esc(a.fuel) + '</td><td>' + esc(a.years) + '</td><td>' + esc(a.position) + '</td><td class="clip">' + esc(a.description) + '</td><td class="editor-only"><button class="link" data-delapp="' + a.id + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table></div><div class="editor-only"><div class="o-group-title" style="margin-top:14px">Add a vehicle</div><div class="cols2" id="newApp">' + [['make', 'Make'], ['model', 'Model'], ['variant', 'Variant'], ['engine_code', 'Engine'], ['years', 'Years'], ['position', 'Position'], ['description', 'Details']].map(function (f) { return '<label>' + f[1] + '<input data-f="' + f[0] + '"></label>'; }).join('') +
        '</div><div class="o-footer"><button type="button" class="btn ghost" id="addApp">Add vehicle</button></div></div>' });
      tabs.push({ key: 'stock', label: 'Stock <span class="muted">(' + L.qty(avail) + ')</span>', html: stock.length ?
        '<table class="grid compact"><thead><tr><th>Warehouse</th><th>Bin</th><th class="num">On hand</th><th class="num">Reserved</th><th class="num">Available</th><th>Updated</th></tr></thead><tbody>' +
        stock.map(function (s) { return '<tr><td>' + esc(s.warehouse) + '</td><td>' + esc(s.bin || '') + '</td><td class="num">' + L.qty(s.qty_on_hand) + '</td><td class="num">' + L.qty(s.qty_reserved) + '</td><td class="num">' + L.qty(s.qty_on_hand - s.qty_reserved) + '</td><td class="small">' + esc(L.dt(s.updated_at)) + '</td></tr>'; }).join('') + '</tbody></table>' :
        '<p class="muted">No stock recorded.</p>' + '<p><a href="' + L.href('inventory', [pn]) + '">Open in Inventory →</a></p>' });
      tabs.push({ key: 'cost', label: 'Cost model', html: '<p class="muted small">Used to calculate Net CIF and RP CIF from the EXW price.</p><div class="o-groups">' + L.group('', COST.map(function (f) { return [f[1], inp('r_' + f[0], pr[f[0]] == null ? '' : Math.round(pr[f[0]] * 10000) / 100, ' inputmode="decimal"')]; })) + '</div>' });
      tabs.push({ key: 'notes', label: 'Notes', html: '<textarea id="p_notes" rows="5"' + (ed ? '' : ' readonly') + '>' + esc(p.notes || '') + '</textarea>' });

      L.form({
        crumbs: [['Parts & prices', BASE], [c.name, L.href('parts', [], { range: p.subcategory })], [p.lucas_pn]],
        buttons: '<button type="button" class="btn editor-only" id="pSave">Save</button><button type="button" class="btn ghost editor-only" id="pDiscard">Discard</button>',
        actions: '<a class="btn ghost" href="' + L.href('inventory', [pn]) + '">Stock</a>' + (p.barcode ? '' : '<a class="btn ghost" href="' + L.href('barcodes', ['parts'], { range: p.subcategory }) + '">Barcode</a>'),
        status: { steps: ['Active', 'Inactive'], current: p.status, clickable: ed, onClick: async function (s) {
          if (!confirm((s === 'Inactive' ? 'Deactivate ' : 'Reactivate ') + pn + '?' + (s === 'Inactive' ? ' It stays in the database but is hidden from the catalogue.' : ''))) return;
          try { L.must(await sb.from('products').update({ status: s }).eq('lucas_pn', pn)); L.toast(pn + ' is now ' + s.toLowerCase()); partForm(pn); } catch (e) { L.fail(e); } } },
        sheet: '<div class="o-title"><h1>' + esc(p.lucas_pn) + '</h1>' + L.pill(p.status) + '</div><div class="o-subtitle">' + esc(p.short_desc) + ' · ' + esc(c.name) + (p.updated_by ? ' · last changed ' + esc(L.dt(p.updated_at)) + ' by ' + esc(p.updated_by) : '') + '</div>' +
          '<div class="o-groups">' + L.group('General', GEN.map(function (f) { return [f[1], inp('p_' + f[0], p[f[0]]) + (f[0] === 'barcode' && ean ? '<div style="margin-top:6px">' + ean + '</div>' : '')]; })) +
          L.group('Price', PRICE.map(function (f) { return [f[1], inp('r_' + f[0], pr[f[0]], f[0] === 'price_list' ? '' : ' inputmode="decimal"')]; }).concat([['Net CIF', L.money(calc.net_cif)], ['RP CIF', L.money(calc.rp_cif)], ['Margin', calc.margin == null ? '' : (calc.margin * 100).toFixed(1) + '%'], ['Available stock', L.qty(avail)]])) + '</div>' +
          L.notebook(tabs, bulb ? 'bulb' : 'specs')
      });
      $('content').querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { var k = b.dataset.add; $('rows-' + k).insertAdjacentHTML('beforeend', rowHtml(k, {})); $('rows-' + k).lastElementChild.querySelector('input').focus(); }; });
      if (!ed) return;
      $('pDiscard').onclick = function () { partForm(pn); };
      $('addApp').onclick = async function () {
        var o = { lucas_pn: pn, source: 'manual' }, any = false;
        $('newApp').querySelectorAll('[data-f]').forEach(function (i) { var v = i.value.trim(); o[i.dataset.f] = v || null; if (v) any = true; });
        if (!any) return L.toast('Fill in at least the make');
        try { L.must(await sb.from('applications').insert(o)); L.toast('Vehicle added'); partForm(pn); } catch (e) { L.fail(e); }
      };
      $('appsTable').onclick = async function (e) {
        var b = e.target.closest('[data-delapp]'); if (!b || !confirm('Remove this vehicle from ' + pn + '?')) return;
        try { L.must(await sb.from('applications').delete().eq('id', Number(b.dataset.delapp))); b.closest('tr').remove(); L.toast('Vehicle removed'); } catch (e) { L.fail(e); }
      };
      $('pSave').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Saving…';
        try {
          var up = { notes: $('p_notes').value.trim() || null }; GEN.forEach(function (f) { var v = $('p_' + f[0]).value.trim(); up[f[0]] = v === '' ? null : v; });
          if (!up.short_desc) throw new Error('Description is required');
          L.must(await sb.from('products').update(up).eq('lucas_pn', pn));
          var pv = { lucas_pn: pn }, touched = !!r[1].data;
          PRICE.forEach(function (f) { var v = $('r_' + f[0]).value.trim(); if (f[0] === 'price_list') pv.price_list = v || null; else { var n = L.num(v); if (Number.isNaN(n)) throw new Error(f[1] + ' must be a number'); pv[f[0]] = n; } if (v) touched = true; });
          COST.forEach(function (f) { var v = $('r_' + f[0]).value.trim(); if (v !== '') { var n = L.num(v); if (Number.isNaN(n)) throw new Error(f[1] + ' must be a number'); pv[f[0]] = n / 100; } });
          if (touched) L.must(await sb.from('product_pricing').upsert(pv, { onConflict: 'lucas_pn' }));
          if (bulb) { var bu = {}; bulbCols.forEach(function (k) { var v = $('b_' + k).value.trim(); bu[k] = v === '' ? null : (k === 'kelvin' ? Number(v) : v); }); L.must(await sb.from('spec_bulbs').update(bu).eq('lucas_pn', pn)); }
          for (var key in LISTS) {
            var d = LISTS[key], now = readRows(key);
            var keep = now.filter(function (x) { return x.id; }).map(function (x) { return x.id; });
            var gone = orig[key].filter(function (o) { return keep.indexOf(o.id) < 0; }).map(function (o) { return o.id; });
            if (gone.length) L.must(await sb.from(d.table).delete().in('id', gone));
            for (var i = 0; i < now.length; i++) {
              var x = now[i], row = { lucas_pn: pn }; d.cols.forEach(function (cc) { row[cc[0]] = x[cc[0]] || null; });
              if (!row[d.req]) { if (x.id) L.must(await sb.from(d.table).delete().eq('id', x.id)); continue; }
              if (key === 'comp' && !row.comp_brand) row.comp_brand = 'Cross-reference';
              if (x.id) { var o = orig[key].find(function (z) { return z.id === x.id; }); if (d.cols.some(function (cc) { return (o[cc[0]] || '') !== (row[cc[0]] || ''); })) L.must(await sb.from(d.table).update(row).eq('id', x.id)); }
              else L.must(await sb.from(d.table).insert(row));
            }
          }
          L.toast('Saved ' + pn); partForm(pn);
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Save'; }
      };
    } catch (e) { L.fail(e); }
  }

  // ---------- wizards (data team) ----------
  function addPart(prefill) {
    prefill = prefill || {};
    var c = prefill.subcategory ? L.cat(prefill.subcategory) : cat();
    L.modal('New part', '<p class="muted">After creating it you can add its price, specifications, OE numbers and vehicles.</p><div class="o-groups">' +
      L.group('', [['Lucas part no.', '<input id="aPn" value="' + esc(prefill.lucas_pn || '') + '" placeholder="e.g. LFOG0200">'], ['Range', '<select id="aRange">' + L.rangeOptions(false, c && c.subcategory_key) + '</select>'], ['Description', '<input id="aDesc" value="' + esc(prefill.short_desc || '') + '">']]) +
      L.group('', [['Brand', '<input id="aBrand" value="' + esc(prefill.brand || 'Lucas') + '">'], ['Supplier PN', '<input id="aSup" value="' + esc(prefill.supplier_pn || '') + '">'], ['Origin', '<input id="aOrigin" value="' + esc(prefill.origin || '') + '">']]) + '</div>' +
      '<label>OE numbers (one per line)<textarea id="aOe" rows="3">' + esc((prefill.oe || []).join('\n')) + '</textarea></label>' +
      '<div class="o-footer"><button class="btn" id="aSave">Create part</button><button class="btn ghost" id="aCancel">Cancel</button></div>');
    $('aCancel').onclick = L.closeModal;
    $('aSave').onclick = async function () {
      var pn = L.clean($('aPn').value), cc = L.cat($('aRange').value), d = $('aDesc').value.trim();
      if (!pn || !d) return L.toast('Part number and description are required');
      try {
        if (L.must(await sb.from('products').select('lucas_pn').eq('lucas_pn', pn).maybeSingle())) { L.toast(pn + ' already exists'); L.closeModal(); return L.openPart(pn); }
        L.must(await sb.from('products').insert({ lucas_pn: pn, category: cc.group_name, subcategory: cc.subcategory_key, short_desc: d, status: 'Active', brand: $('aBrand').value.trim() || 'Lucas', supplier_pn: $('aSup').value.trim() || null, origin: $('aOrigin').value.trim() || null }));
        var oe = $('aOe').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (oe.length) L.must(await sb.from('oe_numbers').upsert(oe.map(function (n, i) { return { lucas_pn: pn, oe_number: n, is_primary: i === 0 }; }), { onConflict: 'lucas_pn,oe_number', ignoreDuplicates: true }));
        S.counts = null; L.closeModal(); L.toast(pn + ' created'); L.openPart(pn);
      } catch (e) { L.fail(e); }
    };
  }
  L.addPartForm = addPart;

  /* Upload parts: one sheet can create new parts and enrich existing ones.
     Columns: Lucas PN, Range, Description, Status, Brand, Origin, Barcode, Supplier PN, HS code, Notes,
     OE numbers ("123, 456 (Ford)"), Vehicle makes ("LAND ROVER, AUDI"),
     "Cross ref: <BRAND>" (one column per brand, several numbers separated by commas or new lines),
     "Spec: <attribute>" (e.g. "Spec: Height" = "96 mm").
     Numbers, cross references and makes are only added (never removed); specifications are set. */
  var SPLIT = /[,;\n]+/;
  function splitList(s) { return String(s || '').split(SPLIT).map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean); }
  function oeOf(s) { var m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(s); return m ? { n: m[1].trim(), b: m[2].trim() } : { n: s, b: null }; }
  async function importParts(f) {
    L.modal('Upload parts', '<p class="muted">Reading ' + esc(f.name) + '…</p>', true);
    try {
      var all = await L.readRows(f); if (all.length < 2) return L.modal('Upload parts', '<p class="flag">The sheet is empty.</p>');
      var heads = all[0].map(function (h) { return String(h || '').replace(/\s+/g, ' ').trim(); }), norm = heads.map(L.normHead);
      var specCols = [], xrefCols = [];
      heads.forEach(function (h, i) {
        var m = /^spec(?:ification)?\s*[:\-]\s*(.+)$/i.exec(h); if (m) specCols.push({ i: i, attr: m[1].trim() });
        var x = /^(?:cross\s*ref(?:erence)?s?|xref)\s*[:\-]\s*(.+)$/i.exec(h); if (x) xrefCols.push({ i: i, brand: x[1].trim().toUpperCase() });
      });
      var byKey = {}, bad = [];
      L.CATS.forEach(function (c) { byKey[c.subcategory_key.toLowerCase()] = c; byKey[c.name.toLowerCase()] = c; });
      var rows = all.slice(1).map(function (r, i) {
        var o = {}; norm.forEach(function (h, j) { if (h && o[h] == null) o[h] = String(r[j] == null ? '' : r[j]).trim(); });
        var rg = L.pick(o, ['range', 'subcategory', 'category', 'productrange']);
        return { line: i + 2, lucas_pn: L.clean(L.pick(o, L.PN_COLS)), cat: rg ? byKey[rg.toLowerCase()] : null, rangeText: rg, short_desc: L.pick(o, ['description', 'shortdesc', 'desc', 'shortdescription']), status: L.pick(o, ['status']),
          brand: L.pick(o, ['brand']), origin: L.pick(o, ['origin', 'countryoforigin']), barcode: L.pick(o, ['barcode', 'ean']), notes: L.pick(o, ['notes', 'note', 'remarks']),
          supplier_pn: L.pick(o, ['supplierpn', 'supplierpartnumber']), hs_code: L.pick(o, ['hscode', 'hs']),
          oe: splitList(L.pick(o, ['oenumbers', 'oenumber', 'oe'])).map(oeOf), makes: splitList(L.pick(o, ['vehiclemakes', 'makes', 'vehiclemake', 'make'])),
          xref: xrefCols.flatMap(function (c) { return splitList(r[c.i]).map(function (n) { return { n: n, b: c.brand }; }); }),
          specs: specCols.map(function (c) { return { a: c.attr, v: String(r[c.i] == null ? '' : r[c.i]).replace(/\s+/g, ' ').trim() }; }).filter(function (s) { return s.v; }) };
      }).filter(function (r) { return r.lucas_pn; });
      if (!rows.length) return L.modal('Upload parts', '<p class="flag">No rows with a "Lucas PN" column were found.</p>');
      var pns = rows.map(function (r) { return r.lucas_pn; }), existing = {}, exOe = {}, exX = {}, exMk = {};
      for (var ch of L.chunks(pns, 200)) {
        L.must(await sb.from('products').select('*').in('lucas_pn', ch)).forEach(function (p) { existing[p.lucas_pn] = p; });
        L.must(await sb.from('oe_numbers').select('lucas_pn,oe_number').in('lucas_pn', ch)).forEach(function (x) { exOe[x.lucas_pn + '|' + L.clean(x.oe_number)] = 1; });
        L.must(await sb.from('competitor_refs').select('lucas_pn,comp_number,comp_brand').in('lucas_pn', ch)).forEach(function (x) { exX[x.lucas_pn + '|' + String(x.comp_brand || '').toUpperCase() + '|' + L.clean(x.comp_number)] = 1; });
        L.must(await sb.from('applications').select('lucas_pn,make,model').in('lucas_pn', ch)).forEach(function (x) { if (x.make) exMk[x.lucas_pn + '|' + x.make.toUpperCase()] = 1; });
      }
      var seen = {};
      rows.forEach(function (r) {
        var ex = existing[r.lucas_pn];
        if (seen[r.lucas_pn]) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' appears twice (also row ' + seen[r.lucas_pn] + ')'); seen[r.lucas_pn] = r.line;
        if (r.rangeText && !r.cat) bad.push('Row ' + r.line + ': range "' + r.rangeText + '" is not one of ' + L.CATS.map(function (c) { return c.name; }).join(', '));
        else if (!ex && !r.cat) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is new, so it needs a range');
        else if (!ex && !r.short_desc) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is new, so it needs a description');
        if (ex && r.cat && ex.subcategory !== r.cat.subcategory_key) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is already in ' + ex.subcategory + ', not ' + r.cat.name);
        if (r.status && !/^(active|inactive)$/i.test(r.status)) bad.push('Row ' + r.line + ': status must be Active or Inactive');
      });
      // what will be added
      var addOe = [], addX = [], addMk = [], setSp = [], k = {};
      rows.forEach(function (r) {
        r.oe.forEach(function (o) { var key = r.lucas_pn + '|' + L.clean(o.n); if (!L.clean(o.n) || exOe[key] || k[key]) return; k[key] = 1; addOe.push({ lucas_pn: r.lucas_pn, oe_number: o.n, oe_brand: o.b }); });
        r.xref.forEach(function (x) { var key = r.lucas_pn + '|' + x.b + '|' + L.clean(x.n); if (!L.clean(x.n) || exX[key] || k[key]) return; k[key] = 1; addX.push({ lucas_pn: r.lucas_pn, comp_number: x.n, comp_brand: x.b }); });
        r.makes.forEach(function (m) { var key = r.lucas_pn + '|' + m.toUpperCase(); if (exMk[key] || k[key]) return; k[key] = 1; addMk.push({ lucas_pn: r.lucas_pn, make: m, source: 'upload' }); });
        r.specs.forEach(function (s) { setSp.push({ lucas_pn: r.lucas_pn, attribute: s.a, value: s.v }); });
      });
      var nNew = rows.filter(function (r) { return !existing[r.lucas_pn]; }).length;
      var cols = ['Lucas PN', 'Range', 'Description', 'Status', 'Brand', 'Origin', 'Barcode', 'Supplier PN', 'HS code', 'Notes', 'OE numbers', 'Vehicle makes'].concat(xrefCols.map(function (c) { return 'Cross ref: ' + c.brand; }), specCols.map(function (c) { return 'Spec: ' + c.attr; }));
      L.modal('Upload parts', '<p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows: <b>' + nNew + '</b> new parts, <b>' + (rows.length - nNew) + '</b> existing parts updated. Blank cells leave the current value unchanged.</p>' +
        '<table class="grid small" style="width:auto;margin:8px 0"><tbody>' +
        [['OE numbers to add', addOe.length], ['Cross references to add', addX.length], ['Vehicle makes to add', addMk.length], ['Specifications to set', setSp.length]].map(function (x) { return '<tr><td>' + x[0] + '</td><td class="num"><b>' + x[1].toLocaleString() + '</b></td></tr>'; }).join('') + '</tbody></table>' +
        (bad.length ? '<div class="notice bad"><b>Fix these first (' + bad.length + '):</b><ul>' + bad.slice(0, 40).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<p class="muted small">Columns read: ' + cols.map(esc).join(', ') + '. Numbers, cross references and makes are only added, never removed. New parts go on the website at the next publish (Parts &amp; prices → Website).</p>' +
        '<div class="o-footer"><button class="btn" id="impGo"' + (bad.length ? ' disabled' : '') + '>Upload ' + rows.length + ' parts</button><button class="btn ghost" id="impX">Cancel</button></div>', true);
      $('impX').onclick = L.closeModal;
      $('impGo').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Uploading…';
        try {
          var F = ['short_desc', 'status', 'brand', 'origin', 'barcode', 'notes', 'supplier_pn', 'hs_code'];
          var up = rows.map(function (r) {
            var ex = existing[r.lucas_pn] || {}, o = { lucas_pn: r.lucas_pn, category: r.cat ? r.cat.group_name : ex.category, subcategory: r.cat ? r.cat.subcategory_key : ex.subcategory };
            F.forEach(function (k2) { var v = r[k2]; if (k2 === 'status' && v) v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); o[k2] = v !== '' ? v : (ex[k2] != null ? ex[k2] : (k2 === 'status' ? 'Active' : k2 === 'brand' ? 'Lucas' : null)); });
            return o;
          });
          for (var c of L.chunks(up, 500)) L.must(await sb.from('products').upsert(c, { onConflict: 'lucas_pn' }));
          for (var c2 of L.chunks(addOe, 500)) L.must(await sb.from('oe_numbers').upsert(c2, { onConflict: 'lucas_pn,oe_number', ignoreDuplicates: true }));
          for (var c3 of L.chunks(addX, 500)) L.must(await sb.from('competitor_refs').upsert(c3, { onConflict: 'lucas_pn,comp_number,comp_brand', ignoreDuplicates: true }));
          for (var c4 of L.chunks(setSp, 500)) L.must(await sb.from('product_specs').upsert(c4, { onConflict: 'lucas_pn,attribute' }));
          for (var c5 of L.chunks(addMk, 500)) L.must(await sb.from('applications').insert(c5));
          S.counts = null; L.closeModal();
          L.toast('Uploaded ' + rows.length + ' parts: ' + addOe.length + ' OE, ' + addX.length + ' cross references, ' + setSp.length + ' specifications, ' + addMk.length + ' vehicle makes');
          L.render();
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Try again'; }
      };
    } catch (e) { L.fail(e); }
  }
  function partsTemplate() {
    var head = ['Lucas PN', 'Range', 'Description', 'Status', 'OE numbers', 'Vehicle makes', 'Cross ref: GUD', 'Cross ref: MANN', 'Cross ref: MAHLE', 'Spec: Type', 'Spec: Height', 'Spec: Outer diameter', 'Spec: Inside diameter', 'Spec: Thread', 'Spec: Length', 'Spec: Width', 'Brand', 'Origin', 'Barcode', 'Supplier PN', 'HS code', 'Notes'];
    var ex = ['LFOG0220', 'Oil Filters', 'Spin-on oil filter', 'Active', 'ERR3340 (Land Rover), 9975153', 'LAND ROVER, ROVER', 'Z381', '', '', 'Spin-on oil filter', '96 mm', '93 mm', '', '3/4-16 UNF', '', '', 'Lucas', '', '', '', '', ''];
    var help = [['Column', 'How to fill it'], ['Lucas PN', 'Required. New number = new part; existing number = the part is updated.'], ['Range', 'Required for new parts: ' + L.CATS.map(function (c) { return c.name; }).join(', ')], ['Description', 'Required for new parts, e.g. "Spin-on oil filter", "Cartridge oil filter", "Panel air filter", "Cabin air filter".'],
      ['Status', 'Active (shown on the website) or Inactive. Blank = Active for new parts.'], ['OE numbers', 'Several separated by commas or new lines. Add the car brand in brackets if you like: "BK2Q-6714-AA (Ford)".'], ['Vehicle makes', 'Makes the part fits, separated by commas.'],
      ['Cross ref: BRAND', 'One column per aftermarket brand (add more columns, e.g. "Cross ref: BOSCH"). Several numbers separated by commas.'], ['Spec: NAME', 'One column per specification. Use the names already used in the range (filters: Type, Height, Outer diameter, Inside diameter, Thread, Length, Width, Bypass valve, Inlet connection, Outlet connection) and include the unit: "96 mm", "100 kPa".'],
      ['Adding only', 'OE numbers, cross references and makes are only added, never removed. Remove them on the part itself.']];
    L.saveXlsx([{ name: 'Parts', widths: head.map(function (h) { return Math.max(12, h.length + 2); }), head: head, rows: [ex] }, { name: 'How to fill', widths: [18, 110], head: help[0], rows: help.slice(1) }], 'Lucas_parts_upload_template.xlsx').catch(L.fail);
  }

  async function uploadPrices(f) {
    L.modal('Upload prices', '<p class="muted">Reading ' + esc(f.name) + '…</p>', true);
    try {
      var raw = await L.readSheet(f), bad = [];
      var rows = raw.map(function (o, i) {
        return { line: i + 2, lucas_pn: L.clean(L.pick(o, L.PN_COLS)), fob: L.num(L.pick(o, ['fobusd', 'fob', 'fobprice', 'fobpriceusd', 'fobusdprice'])), exw: L.num(L.pick(o, ['exwusd', 'exw', 'exwprice', 'exwpriceusd'])), list: L.pick(o, ['pricelist', 'pricelistname', 'list']) };
      }).filter(function (r) { return r.lucas_pn && (r.fob != null || r.exw != null || r.list); });
      if (!rows.length) return L.modal('Upload prices', '<p class="flag">No rows with a Lucas PN and a price were found. Columns: "Lucas PN" and "FOB USD" (optional "EXW USD", "Price list").</p>');
      rows.forEach(function (r) { if (Number.isNaN(r.fob) || Number.isNaN(r.exw)) bad.push('Row ' + r.line + ' (' + r.lucas_pn + '): price is not a number'); else if ((r.fob != null && r.fob < 0) || (r.exw != null && r.exw < 0)) bad.push('Row ' + r.line + ': negative price'); });
      var known = {}, cur = {};
      for (var ch of L.chunks(rows.map(function (r) { return r.lucas_pn; }), 300)) {
        L.must(await sb.from('products').select('lucas_pn,short_desc').in('lucas_pn', ch)).forEach(function (p) { known[p.lucas_pn] = p.short_desc; });
        L.must(await sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd,price_list').in('lucas_pn', ch)).forEach(function (p) { cur[p.lucas_pn] = p; });
      }
      var unknown = rows.filter(function (r) { return !(r.lucas_pn in known); });
      var ok = rows.filter(function (r) { return r.lucas_pn in known && !Number.isNaN(r.fob) && !Number.isNaN(r.exw); });
      var changed = ok.filter(function (r) { var c = cur[r.lucas_pn] || {}; return (r.fob != null && Number(c.fob_usd) !== r.fob) || (r.exw != null && Number(c.exw_usd) !== r.exw) || (r.list && r.list !== c.price_list); });
      L.modal('Upload prices', '<p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows, <b>' + changed.length + '</b> prices will change, ' + (ok.length - changed.length) + ' unchanged' + (unknown.length ? ', <span class="flag">' + unknown.length + ' part numbers not in the database (skipped)</span>' : '') + '. Blank cells never remove a price.</p>' +
        (bad.length ? '<div class="notice bad"><b>Fix these first:</b><ul>' + bad.slice(0, 30).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>' : '') +
        (unknown.length ? '<p class="small muted">Not found: ' + esc(unknown.slice(0, 40).map(function (r) { return r.lucas_pn; }).join(', ')) + (unknown.length > 40 ? '…' : '') + '</p>' : '') +
        (changed.length ? '<div class="o-list"><table class="grid"><thead><tr><th>Lucas PN</th><th>Description</th><th class="num">FOB now</th><th class="num">FOB new</th><th class="num">EXW now</th><th class="num">EXW new</th></tr></thead><tbody>' +
          changed.slice(0, 300).map(function (r) { var c = cur[r.lucas_pn] || {}; return '<tr><td class="pn">' + esc(r.lucas_pn) + '</td><td class="clip">' + esc(known[r.lucas_pn]) + '</td><td class="num">' + L.money(c.fob_usd) + '</td><td class="num"><b>' + (r.fob == null ? L.money(c.fob_usd) : L.money(r.fob)) + '</b></td><td class="num">' + L.money(c.exw_usd) + '</td><td class="num">' + (r.exw == null ? L.money(c.exw_usd) : L.money(r.exw)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<div class="o-footer"><button class="btn" id="prApply"' + (bad.length || !changed.length ? ' disabled' : '') + '>Update ' + changed.length + ' prices</button><button class="btn ghost" id="prX">Cancel</button></div>', true);
      $('prX').onclick = L.closeModal;
      $('prApply').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Updating…';
        try {
          var up = changed.map(function (r) { var c = cur[r.lucas_pn] || {}; return { lucas_pn: r.lucas_pn, fob_usd: r.fob != null ? r.fob : (c.fob_usd != null ? c.fob_usd : null), exw_usd: r.exw != null ? r.exw : (c.exw_usd != null ? c.exw_usd : null), price_list: r.list || c.price_list || null }; });
          for (var c of L.chunks(up, 500)) L.must(await sb.from('product_pricing').upsert(c, { onConflict: 'lucas_pn' }));
          L.closeModal(); L.toast('Updated ' + up.length + ' prices'); L.render();
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Try again'; }
      };
    } catch (e) { L.fail(e); }
  }
  async function template(sub, onlyMissing) {
    var c = L.cat(sub);
    var res = await Promise.all([L.fetchAll(function () { return sb.from('products').select('lucas_pn,short_desc,status').eq('subcategory', sub).order('lucas_pn'); }), L.fetchAll(function () { return sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd,price_list').order('lucas_pn'); })]);
    var pr = {}; res[1].forEach(function (p) { pr[p.lucas_pn] = p; });
    var rows = res[0].filter(function (p) { return p.status === 'Active' && (!onlyMissing || !pr[p.lucas_pn] || pr[p.lucas_pn].fob_usd == null); });
    if (!rows.length) return L.toast('Every active ' + c.name.toLowerCase() + ' part already has an FOB price');
    await L.saveXlsx([{ name: 'Prices', widths: [12, 60, 14, 10, 10, 16], head: ['Lucas PN', 'Description', 'Range', 'FOB USD', 'EXW USD', 'Price list'],
      rows: rows.map(function (p) { var x = pr[p.lucas_pn] || {}; return [p.lucas_pn, p.short_desc, c.name, x.fob_usd == null ? '' : Number(x.fob_usd), x.exw_usd == null ? '' : Number(x.exw_usd), x.price_list || '']; }) }], 'Lucas_prices_' + c.name.replace(/\s+/g, '_') + '.xlsx');
  }

  // ---------- price coverage page ----------
  async function coverage() {
    L.cp({ crumbs: [['Parts & prices', BASE], ['Price coverage']], buttons: '<button type="button" class="btn editor-only" id="cvUp">Upload prices</button>' });
    $('cvUp').onclick = function () { L.pickFile(uploadPrices); };
    L.content('<div class="o-list" style="max-height:none;margin-bottom:16px"><table class="grid" id="cvTable"><tbody><tr><td class="empty">Loading…</td></tr></tbody></table></div>' +
      '<div class="card"><h2>Price list template</h2><p class="muted small">Download a range with its current prices, fill in FOB USD (and EXW if you have it), then use "Upload prices".</p>' +
      '<div class="o-bar"><select id="cvRange" style="width:auto">' + L.rangeOptions(false, S.range) + '</select><label class="check"><input type="checkbox" id="cvMissing" checked> Only parts without an FOB price</label><button class="btn ghost" id="cvTpl">Download template</button></div></div>');
    $('cvTpl').onclick = function () { template($('cvRange').value, $('cvMissing').checked).catch(L.fail); };
    try {
      var res = await Promise.all([L.fetchAll(function () { return sb.from('products').select('lucas_pn,subcategory,status').order('lucas_pn'); }), L.fetchAll(function () { return sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd').order('lucas_pn'); })]);
      var price = {}; res[1].forEach(function (p) { price[p.lucas_pn] = p; });
      var by = {}; res[0].forEach(function (p) { if (p.status !== 'Active') return; var b = by[p.subcategory] = by[p.subcategory] || { n: 0, fob: 0, exw: 0 }; b.n++; var x = price[p.lucas_pn]; if (x && x.fob_usd != null) b.fob++; if (x && x.exw_usd != null) b.exw++; });
      var tot = { n: 0, fob: 0, exw: 0 };
      $('cvTable').innerHTML = '<thead><tr><th>Range</th><th class="num">Active parts</th><th class="num">With FOB price</th><th class="num">Missing FOB</th><th class="num">Coverage</th><th class="num">With EXW price</th></tr></thead><tbody>' +
        L.CATS.map(function (c) { var b = by[c.subcategory_key] || { n: 0, fob: 0, exw: 0 }; tot.n += b.n; tot.fob += b.fob; tot.exw += b.exw;
          return '<tr class="click" data-href="' + esc(L.href('parts', [], { range: c.subcategory_key })) + '"><td>' + esc(c.name) + '</td><td class="num">' + b.n.toLocaleString() + '</td><td class="num">' + b.fob.toLocaleString() + '</td><td class="num">' + (b.n - b.fob ? '<span class="flag">' + (b.n - b.fob).toLocaleString() + '</span>' : '0') + '</td><td class="num">' + (b.n ? Math.round(b.fob / b.n * 100) : 0) + '%</td><td class="num">' + b.exw.toLocaleString() + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + tot.n.toLocaleString() + '</td><td class="num">' + tot.fob.toLocaleString() + '</td><td class="num">' + (tot.n - tot.fob).toLocaleString() + '</td><td class="num">' + (tot.n ? Math.round(tot.fob / tot.n * 100) : 0) + '%</td><td class="num">' + tot.exw.toLocaleString() + '</td></tr></tfoot>';
    } catch (e) { L.fail(e); }
  }

  // ---------- website publishing ----------
  var STATUS = { requested: ['Waiting', 'New'], running: ['Publishing…', 'Quoted'], published: ['Published', 'Won'], no_changes: ['Nothing to change', 'Closed'],
    preview: ['Preview', 'Website'], blocked: ['Stopped: check', 'warn'], failed: ['Failed', 'warn'] };
  var pubTimer = null;
  function changeText(c) {
    var bits = [], v = function (x) { return x && typeof x === 'object' ? Object.keys(x).map(function (k) { return k + ' ' + x[k]; }).join(', ') : String(x == null ? '' : x); };
    if (c.kind === 'new part') bits.push(esc(c.description || '') + (c.range ? ' <span class="muted">(' + esc(c.range) + ')</span>' : ''));
    else if (c.kind === 'removed part') bits.push(esc(c.reason || ''));
    else if (c.to !== undefined) {
      if (typeof c.to === 'object') {   // specifications: list only what changed
        var f = c.from || {}, tt = c.to || {}, d = [];
        Object.keys(tt).forEach(function (k) { if (f[k] !== tt[k]) d.push(esc(k) + ' ' + (f[k] ? '<s class="muted">' + esc(f[k]) + '</s> ' : '') + esc(tt[k])); });
        Object.keys(f).forEach(function (k) { if (!(k in tt)) d.push(esc(k) + ' <s class="muted">' + esc(f[k]) + '</s> removed'); });
        bits.push(d.join('; '));
      } else bits.push((c.from ? '<s class="muted">' + esc(v(c.from)) + '</s> → ' : '') + esc(v(c.to)));
    }
    if (c.added && c.added.length) bits.push('added ' + c.added.map(esc).join(', '));
    if (c.removed) bits.push('removed ' + c.removed + (c.vehicle ? ' (' + esc(c.vehicle) + ')' : ''));
    return '<span class="mono">' + esc(c.pn) + '</span> <b>' + esc(c.kind) + '</b>: ' + bits.join('; ');
  }
  function summaryLine(sm) {
    var b = [];
    if (sm.partsAdded) b.push(sm.partsAdded + ' new'); if (sm.partsRemoved) b.push(sm.partsRemoved + ' removed'); if (sm.partsUpdated) b.push(sm.partsUpdated + ' updated');
    if (!b.length && (sm.added || sm.removed)) b.push((sm.added || 0) + ' numbers added, ' + (sm.removed || 0) + ' removed');
    return b.join(', ');
  }
  async function publishPage() {
    clearTimeout(pubTimer);
    L.cp({ crumbs: [['Parts & prices', BASE], ['Website publishing']], buttons: '<button type="button" class="btn editor-only" id="pubGo">Publish to website</button>' });
    $('pubGo').onclick = requestPublish;
    try {
      var rows = L.must(await sb.from('publish_log').select('*').order('id', { ascending: false }).limit(50));
      var waiting = rows.find(function (r) { return r.status === 'requested' || r.status === 'running'; });
      var last = rows.find(function (r) { return r.status === 'published'; });
      var intro = '<div class="card"><p>The public catalogue at <a href="https://lucasmeacatalogue.com" target="_blank" rel="noopener">lucasmeacatalogue.com</a> is updated from this database. ' +
        'Published: <b>new parts</b> (status Active), <b>removed parts</b> (deleted or status changed from Active), <b>descriptions, specifications, vehicles</b>, and <b>OE and cross-reference numbers</b>.</p>' +
        '<p class="muted small">Every hour the website picks up changes automatically. Press <b>Publish to website</b> (data team) to do it now: it starts within about 10 minutes and takes a minute or two.' +
        ' Only what changed in the database is changed on the website; pictures stay as they are, and new parts show "image to follow" until a picture is added.' +
        ' A few things stay in the database only: OE numbers on the Horns, Bulbs and Wiper pages (they have no OE column), bulb cross references other than Osram, Philips and Hella, and specifications a page has no field for.' +
        ' If one publish would remove more than 25 parts, 100 numbers or 500 vehicles, it stops and nothing changes.</p>' +
        (waiting ? '<div class="notice">' + L.pill(STATUS[waiting.status][0], STATUS[waiting.status][1]) + ' requested ' + esc(L.dt(waiting.requested_at)) + (waiting.requested_by ? ' by ' + esc(waiting.requested_by) : '') + '. This page refreshes by itself.</div>' : '') +
        (last ? '<p class="small">Last published: <b>' + esc(L.dt(last.finished_at)) + '</b></p>' : '') + '</div>';
      var list = rows.length ? L.listView([
        { label: 'When', render: function (r) { return '<span class="small">' + esc(L.dt(r.finished_at || r.started_at || r.requested_at)) + '</span>'; } },
        { label: 'Started by', render: function (r) { return esc(r.requested_by || (r.source === 'hourly' ? 'Automatic (hourly)' : r.source === 'button' ? 'Publish button' : r.source)); } },
        { label: 'Status', render: function (r) { var s = STATUS[r.status] || [r.status, '']; return L.pill(s[0], s[1]); } },
        { label: 'Parts', render: function (r) { return r.summary ? '<span class="small">' + esc(summaryLine(r.summary)) + '</span>' : ''; } },
        { label: 'Changes', cls: 'clip', render: function (r) {
          var sm = r.summary || {}, ch = sm.changes || [];
          if (sm.blocked) return '<span class="flag">' + esc(sm.blocked) + '</span>';
          if (!ch.length) return '<span class="muted">' + (r.status === 'requested' || r.status === 'running' ? '' : 'none') + '</span>';
          return '<details><summary>' + ch.length + ' change' + (ch.length > 1 ? 's' : '') + (sm.moreChanges ? ' (+' + sm.moreChanges + ' more)' : '') + ': ' + ch.map(function (c) { return c.pn; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 3).map(esc).join(', ') + (ch.length > 3 ? '…' : '') + '</summary><div class="small">' + ch.map(changeText).join('<br>') + '</div></details>';
        } },
        { label: '', render: function (r) { return r.summary && r.summary.run ? '<a class="small" href="' + esc(r.summary.run) + '" target="_blank" rel="noopener">details</a>' : ''; } }
      ], rows) : L.empty('Nothing published yet', 'The first automatic publish runs within the hour.');
      L.content(intro + list);
      if (waiting) pubTimer = setTimeout(function () { if (/publish/.test(location.hash)) publishPage(); }, 20000);
    } catch (e) { L.fail(e); }
  }
  async function requestPublish() {
    var b = $('pubGo'); if (b) { b.disabled = true; b.textContent = 'Requesting…'; }
    try {
      var res = await sb.functions.invoke('publish', { body: { action: 'request' } });
      if (res.error) {
        var msg = res.error.message;
        try { var j = await res.error.context.json(); if (j && j.error) msg = j.error; } catch (e2) { /* keep message */ }
        throw new Error(msg);
      }
      L.toast(res.data && res.data.dispatched ? 'Publishing now. The website updates in a minute or two.' : 'Publish requested. The website updates within about 10 minutes.');
      L.go(L.href('parts', ['publish']));
    } catch (e) { L.fail(e); if (b) { b.disabled = false; b.textContent = 'Publish to website'; } }
  }

  L.register({
    key: 'parts', name: 'Parts & Prices', color: '#1d6fa5',
    icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
    menus: [{ label: 'Parts', href: BASE }, { label: 'Price coverage', href: L.href('parts', ['coverage']) }, { label: 'Website', href: L.href('parts', ['publish']) },
      { label: 'Data', editor: true, children: [{ label: 'New part', action: 'new' }, { label: 'Upload parts', action: 'imp' }, { label: 'Parts upload template', action: 'tpl' }, { label: 'Upload prices', action: 'prices' }, { label: 'Price list template', href: L.href('parts', ['coverage']) }, { label: 'Publish to website', action: 'publish' }] }],
    actions: { new: function () { addPart(); }, imp: function () { L.pickFile(importParts); }, tpl: partsTemplate, prices: function () { L.pickFile(uploadPrices); }, publish: requestPublish },
    route: function (r) { if (r.parts[0] === 'p' && r.parts[1]) partForm(r.parts[1]); else if (r.parts[0] === 'coverage') coverage(); else if (r.parts[0] === 'publish') publishPage(); else list(r); }
  });
})(window.LS);
