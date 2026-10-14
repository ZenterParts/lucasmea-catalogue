/* Module 3: Parts & prices. Everyone can view and download; the data team edits and uploads */
(function (L) {
  'use strict';
  var $ = L.$, esc = L.esc, sb = L.sb, st = { page: 0 };

  function curCat() { return L.CATS.find(function (c) { return c.subcategory_key === $('ptRange').value; }) || L.CATS[0]; }
  function searchCols(view) { return view === 'bulbs_full' ? ['lucas_pn', 'description', 'supplier_pn'] : ['lucas_pn', 'description', 'oe_numbers', 'competitor_numbers']; }
  function query(cat, opts) {
    var q = sb.from(cat.view_name).select('*', opts);
    if ($('ptStatus').value) q = q.eq('status', $('ptStatus').value);
    if ($('ptPrice').value === 'with') q = q.not('fob_usd', 'is', null);
    if ($('ptPrice').value === 'without') q = q.is('fob_usd', null);
    var s = L.orSearch(searchCols(cat.view_name), $('ptSearch').value); if (s) q = q.or(s);
    return q.order('lucas_pn');
  }
  async function chips(cat) {
    try {
      var r = await Promise.all([
        sb.from(cat.view_name).select('lucas_pn', { count: 'exact', head: true }).eq('status', 'Active'),
        sb.from(cat.view_name).select('lucas_pn', { count: 'exact', head: true }).eq('status', 'Active').not('fob_usd', 'is', null)
      ]);
      var all = r[0].count || 0, priced = r[1].count || 0;
      $('ptChips').innerHTML = '<span class="chip static">' + all.toLocaleString() + ' active ' + esc(cat.name.toLowerCase()) + '</span>' +
        '<span class="chip static ' + (priced < all ? 'warn' : 'good') + '">' + priced.toLocaleString() + ' with FOB price</span>';
    } catch (e) { /* chips are informative only */ }
  }
  async function load(page) {
    if (page != null) st.page = page;
    var cat = curCat(); if (!cat) return;
    if (page === 0) chips(cat);
    try {
      var res = await query(cat, { count: 'exact' }).range(st.page * L.PAGE, st.page * L.PAGE + L.PAGE - 1);
      var rows = L.must(res), t = $('ptTable');
      if (!rows.length) { t.innerHTML = '<tbody><tr><td class="empty">No parts found.</td></tr></tbody>'; $('ptPager').innerHTML = ''; return; }
      var cols = Object.keys(rows[0]).filter(function (k) { return k !== 'fob_usd'; }); cols.splice(2, 0, 'fob_usd');  // FOB next to the description
      t.innerHTML = '<thead><tr>' + cols.map(function (k) { return '<th' + (L.NUMCOLS.test(k) || L.PCTCOLS.test(k) ? ' class="num"' : '') + '>' + esc(L.label(k)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr class="click" data-pn="' + esc(r.lucas_pn) + '">' + cols.map(function (k) { return L.cell(k, r[k]); }).join('') + '</tr>'; }).join('') + '</tbody>';
      L.pager($('ptPager'), st.page, res.count || rows.length, load);
    } catch (e) { L.fail(e); }
  }
  async function exportRange() {
    var cat = curCat(); L.toast('Preparing ' + cat.name + '…');
    try {
      var rows = await L.fetchAll(function () { return query(cat); });
      if (!rows.length) return L.toast('Nothing to download');
      var cols = Object.keys(rows[0]).filter(function (k) { return k !== 'fob_usd'; }); cols.splice(2, 0, 'fob_usd');
      await L.saveXlsx([{ name: cat.name, head: cols.map(L.label), rows: rows.map(function (r) { return cols.map(function (k) { var v = r[k]; return v == null ? '' : (L.NUMCOLS.test(k) || L.PCTCOLS.test(k)) ? Number(v) : v; }); }) }],
        'Lucas_' + cat.name.replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    } catch (e) { L.fail(e); }
  }

  // ---------- one part ----------
  var PRODUCT_FIELDS = [['short_desc', 'Description'], ['long_desc', 'Long description'], ['brand', 'Brand'], ['origin', 'Origin'], ['supplier_pn', 'Supplier PN'], ['zp_pn', 'ZP PN'], ['barcode', 'Barcode'], ['hs_code', 'HS code'], ['notes', 'Notes']];
  var PRICE_FIELDS = [['fob_usd', 'FOB USD'], ['exw_usd', 'EXW USD'], ['price_list', 'Price list']];
  var COST_FIELDS = [['pct_cons', 'Consolidation %'], ['pct_ship', 'Shipping %'], ['pct_ins', 'Insurance %'], ['pct_port', 'Port %'], ['pct_wh', 'Warehouse %'], ['min_retention', 'Min. retention %'], ['max_discount', 'Max. discount %']];
  var LIST_DEFS = {
    specs: { table: 'product_specs', cols: [['attribute', 'Attribute'], ['value', 'Value']], title: 'Specifications', req: 'attribute' },
    oe: { table: 'oe_numbers', cols: [['oe_number', 'OE number'], ['oe_brand', 'Vehicle brand']], title: 'OE numbers', req: 'oe_number' },
    comp: { table: 'competitor_refs', cols: [['comp_brand', 'Brand'], ['comp_number', 'Number']], title: 'Competitor numbers', req: 'comp_number' }
  };
  function inp(id, v, attrs) { return '<input id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (L.isEditor() ? '' : ' readonly') + (attrs || '') + '>'; }
  function rowHtml(key, it) {
    var d = LIST_DEFS[key];
    return '<div class="row" data-id="' + esc(it.id || '') + '">' + d.cols.map(function (c) {
      return '<input data-f="' + c[0] + '" placeholder="' + c[1] + '" value="' + esc(it[c[0]] == null ? '' : it[c[0]]) + '"' + (L.isEditor() ? '' : ' readonly') + '>';
    }).join('') + '<button type="button" class="x editor-only" title="Remove">×</button></div>';
  }
  function rowsHtml(key, items) {
    return '<h3>' + LIST_DEFS[key].title + ' <span class="muted small">(' + items.length + ')</span></h3><div class="rows" id="rows-' + key + '">' +
      items.map(function (it) { return rowHtml(key, it); }).join('') + '</div>' +
      '<button type="button" class="btn ghost small editor-only" data-add="' + key + '" style="margin-top:8px">+ Add</button>';
  }
  function readRows(key) {
    var d = LIST_DEFS[key];
    return Array.from(document.querySelectorAll('#rows-' + key + ' .row')).map(function (r) {
      var o = { id: r.dataset.id ? Number(r.dataset.id) : null }; d.cols.forEach(function (c) { o[c[0]] = r.querySelector('[data-f="' + c[0] + '"]').value.trim(); }); return o;
    });
  }

  async function openPart(pn) {
    try {
      var r = await Promise.all([
        sb.from('products').select('*').eq('lucas_pn', pn).single(),
        sb.from('product_pricing').select('*').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_prices').select('cost_zenter,rp_cif,net_cif,margin').eq('lucas_pn', pn).maybeSingle(),
        sb.from('product_specs').select('*').eq('lucas_pn', pn).order('id'),
        sb.from('oe_numbers').select('*').eq('lucas_pn', pn).order('id'),
        sb.from('competitor_refs').select('*').eq('lucas_pn', pn).order('comp_brand'),
        sb.from('applications').select('*', { count: 'exact' }).eq('lucas_pn', pn).order('make').order('model').limit(300),
        sb.from('spec_bulbs').select('*').eq('lucas_pn', pn).maybeSingle(),
        sb.from('inventory').select('*').eq('lucas_pn', pn).order('warehouse')
      ]);
      var p = L.must(r[0]), pr = L.must(r[1]) || {}, calc = L.must(r[2]) || {}, specs = L.must(r[3]), oe = L.must(r[4]), comp = L.must(r[5]),
        apps = L.must(r[6]), appCount = r[6].count || apps.length, bulb = L.must(r[7]), stock = L.must(r[8]);
      var orig = { specs: specs, oe: oe, comp: comp };
      var bulbCols = bulb ? Object.keys(bulb).filter(function (k) { return k !== 'lucas_pn'; }) : [];
      var avail = stock.reduce(function (s, x) { return s + Number(x.qty_on_hand) - Number(x.qty_reserved); }, 0);
      L.drawer('<h1>' + esc(p.lucas_pn) + ' <span class="pill ' + (p.status === 'Active' ? 'Won' : 'Closed') + '">' + esc(p.status || '') + '</span></h1>' +
        '<p class="muted">' + esc(p.category) + ' › ' + esc(p.subcategory) + (p.updated_by ? ' · last changed ' + esc(L.dt(p.updated_at)) + ' by ' + esc(p.updated_by) : '') + '</p>' +
        '<h3>Part</h3><div class="form2">' + PRODUCT_FIELDS.map(function (f) { return '<label>' + f[1] + inp('p_' + f[0], p[f[0]]) + '</label>'; }).join('') + '</div>' +
        '<h3>Price</h3><div class="form2">' + PRICE_FIELDS.map(function (f) { return '<label>' + f[1] + inp('r_' + f[0], pr[f[0]], f[0] === 'price_list' ? '' : ' inputmode="decimal"') + '</label>'; }).join('') +
        '<label>Net CIF (calculated)<input readonly value="' + L.money(calc.net_cif) + '"></label><label>RP CIF (calculated)<input readonly value="' + L.money(calc.rp_cif) + '"></label></div>' +
        '<details><summary class="small muted" style="cursor:pointer;margin-top:8px">Cost model used for CIF (from EXW)</summary><div class="form2">' +
        COST_FIELDS.map(function (f) { return '<label>' + f[1] + inp('r_' + f[0], pr[f[0]] == null ? '' : Math.round(pr[f[0]] * 10000) / 100, ' inputmode="decimal"') + '</label>'; }).join('') + '</div></details>' +
        '<h3>Stock <span class="muted small">(' + L.qty(avail) + ' available)</span></h3>' +
        (stock.length ? '<table class="grid compact"><thead><tr><th>Warehouse</th><th>Bin</th><th class="num">On hand</th><th class="num">Reserved</th><th class="num">Available</th><th>Updated</th></tr></thead><tbody>' +
          stock.map(function (s) { return '<tr><td>' + esc(s.warehouse) + '</td><td>' + esc(s.bin || '') + '</td><td class="num">' + L.qty(s.qty_on_hand) + '</td><td class="num">' + L.qty(s.qty_reserved) + '</td><td class="num">' + L.qty(s.qty_on_hand - s.qty_reserved) + '</td><td class="small">' + esc(L.dt(s.updated_at)) + '</td></tr>'; }).join('') + '</tbody></table>'
          : '<p class="muted small">No stock recorded. Stock is managed in the Inventory module.</p>') +
        (bulb ? '<h3>Bulb specifications</h3><div class="form2">' + bulbCols.map(function (k) { return '<label>' + esc(L.label(k)) + inp('b_' + k, bulb[k]) + '</label>'; }).join('') + '</div>' : '') +
        rowsHtml('specs', specs) + rowsHtml('oe', oe) + rowsHtml('comp', comp) +
        '<h3>Vehicles <span class="muted small">(' + appCount + (appCount > apps.length ? ', first ' + apps.length + ' shown' : '') + ')</span></h3>' +
        '<div class="tablewrap" style="max-height:340px"><table class="grid" id="appsTable"><thead><tr><th>Make</th><th>Model</th><th>Variant</th><th>Engine</th><th>Fuel</th><th>Years</th><th>Position</th><th>Details</th><th class="editor-only"></th></tr></thead><tbody>' +
        apps.map(function (a) { return '<tr data-id="' + a.id + '"><td>' + esc(a.make) + '</td><td>' + esc(a.model) + '</td><td>' + esc(a.variant) + '</td><td>' + esc(a.engine_code) + '</td><td>' + esc(a.fuel) + '</td><td>' + esc(a.years) + '</td><td>' + esc(a.position) + '</td><td>' + esc(a.description) + '</td><td class="editor-only"><button class="link" data-delapp="' + a.id + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table></div>' +
        '<div class="editor-only"><div class="form2" id="newApp">' + [['make', 'Make'], ['model', 'Model'], ['variant', 'Variant'], ['engine_code', 'Engine'], ['years', 'Years'], ['position', 'Position'], ['description', 'Details']].map(function (f) { return '<label>' + f[1] + '<input data-f="' + f[0] + '"></label>'; }).join('') +
        '</div><button type="button" class="btn ghost small" id="addApp" style="margin-top:8px">+ Add vehicle</button></div>' +
        '<div class="actions editor-only"><button class="btn" id="pSave">Save changes</button>' +
        '<button class="btn danger" id="pToggle">' + (p.status === 'Active' ? 'Deactivate (hide from catalogue)' : 'Reactivate') + '</button></div>');

      document.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { var k = b.dataset.add; $('rows-' + k).insertAdjacentHTML('beforeend', rowHtml(k, {})); $('rows-' + k).lastElementChild.querySelector('input').focus(); }; });
      if (!L.isEditor()) return;

      $('addApp').onclick = async function () {
        var o = { lucas_pn: pn, source: 'manual' }, any = false;
        $('newApp').querySelectorAll('[data-f]').forEach(function (i) { var v = i.value.trim(); o[i.dataset.f] = v || null; if (v) any = true; });
        if (!any) return L.toast('Fill in at least the make');
        try { L.must(await sb.from('applications').insert(o)); L.toast('Vehicle added'); openPart(pn); } catch (e) { L.fail(e); }
      };
      $('appsTable').onclick = async function (e) {
        var b = e.target.closest('[data-delapp]'); if (!b || !confirm('Remove this vehicle from ' + pn + '?')) return;
        try { L.must(await sb.from('applications').delete().eq('id', Number(b.dataset.delapp))); b.closest('tr').remove(); L.toast('Vehicle removed'); } catch (e) { L.fail(e); }
      };
      $('pToggle').onclick = async function () {
        var to = p.status === 'Active' ? 'Inactive' : 'Active';
        if (!confirm((to === 'Inactive' ? 'Deactivate ' : 'Reactivate ') + pn + '?')) return;
        try { L.must(await sb.from('products').update({ status: to }).eq('lucas_pn', pn)); L.toast(pn + ' is now ' + to.toLowerCase()); load(); openPart(pn); } catch (e) { L.fail(e); }
      };
      $('pSave').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Saving…';
        try {
          var up = {}; PRODUCT_FIELDS.forEach(function (f) { var v = $('p_' + f[0]).value.trim(); up[f[0]] = v === '' ? null : v; });
          if (!up.short_desc) throw new Error('Description is required');
          L.must(await sb.from('products').update(up).eq('lucas_pn', pn));
          var pv = { lucas_pn: pn }, touched = !!r[1].data;
          PRICE_FIELDS.forEach(function (f) {
            var v = $('r_' + f[0]).value.trim();
            if (f[0] === 'price_list') pv.price_list = v || null;
            else { var n = L.num(v); if (Number.isNaN(n)) throw new Error(f[1] + ' must be a number'); pv[f[0]] = n; }
            if (v) touched = true;
          });
          COST_FIELDS.forEach(function (f) { var v = $('r_' + f[0]).value.trim(); if (v !== '') { var n = L.num(v); if (Number.isNaN(n)) throw new Error(f[1] + ' must be a number'); pv[f[0]] = n / 100; } });
          if (touched) L.must(await sb.from('product_pricing').upsert(pv, { onConflict: 'lucas_pn' }));
          if (bulb) { var bu = {}; bulbCols.forEach(function (k) { var v = $('b_' + k).value.trim(); bu[k] = v === '' ? null : (k === 'kelvin' ? Number(v) : v); }); L.must(await sb.from('spec_bulbs').update(bu).eq('lucas_pn', pn)); }
          for (var key in LIST_DEFS) {
            var d = LIST_DEFS[key], now = readRows(key);
            var keep = now.filter(function (x) { return x.id; }).map(function (x) { return x.id; });
            var gone = orig[key].filter(function (o) { return keep.indexOf(o.id) < 0; }).map(function (o) { return o.id; });
            if (gone.length) L.must(await sb.from(d.table).delete().in('id', gone));
            for (var i = 0; i < now.length; i++) {
              var x = now[i], row = { lucas_pn: pn }; d.cols.forEach(function (c) { row[c[0]] = x[c[0]] || null; });
              if (!row[d.req]) { if (x.id) L.must(await sb.from(d.table).delete().eq('id', x.id)); continue; }
              if (key === 'comp' && !row.comp_brand) row.comp_brand = 'Cross-reference';
              if (x.id) {
                var o = orig[key].find(function (z) { return z.id === x.id; }), changed = d.cols.some(function (c) { return (o[c[0]] || '') !== (row[c[0]] || ''); });
                if (changed) L.must(await sb.from(d.table).update(row).eq('id', x.id));
              } else L.must(await sb.from(d.table).insert(row));
            }
          }
          L.toast('Saved ' + pn); load(); openPart(pn);
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Save changes'; }
      };
    } catch (e) { L.fail(e); }
  }
  L.openPart = openPart;

  // ---------- add one part (data team) ----------
  L.addPartForm = function (prefill) {
    prefill = prefill || {};
    var cat = prefill.subcategory ? L.CATS.find(function (c) { return c.subcategory_key === prefill.subcategory; }) : curCat();
    L.drawer('<h1>Add a part</h1><p class="muted">After saving you can add its price, specifications, OE numbers and vehicles.</p><div class="form2">' +
      '<label>Lucas part number<input id="aPn" placeholder="e.g. LFOG0200" value="' + esc(prefill.lucas_pn || '') + '"></label>' +
      '<label>Range<select id="aRange">' + L.CATS.map(function (c) { return '<option value="' + esc(c.subcategory_key) + '"' + (c === cat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>Brand<input id="aBrand" value="' + esc(prefill.brand || 'Lucas') + '"></label><label>Supplier PN<input id="aSup" value="' + esc(prefill.supplier_pn || '') + '"></label><label>Origin<input id="aOrigin" value="' + esc(prefill.origin || '') + '"></label></div>' +
      '<label>Description<input id="aDesc" value="' + esc(prefill.short_desc || '') + '"></label>' +
      '<label>OE numbers (one per line)<textarea id="aOe">' + esc((prefill.oe || []).join('\n')) + '</textarea></label><div class="actions"><button class="btn" id="aSave">Create part</button></div>');
    $('aSave').onclick = async function () {
      var pn = L.clean($('aPn').value), c = L.CATS.find(function (x) { return x.subcategory_key === $('aRange').value; }), d = $('aDesc').value.trim();
      if (!pn || !d) return L.toast('Part number and description are required');
      try {
        var ex = L.must(await sb.from('products').select('lucas_pn').eq('lucas_pn', pn).maybeSingle());
        if (ex) { L.toast(pn + ' already exists'); return openPart(pn); }
        L.must(await sb.from('products').insert({ lucas_pn: pn, category: c.group_name, subcategory: c.subcategory_key, short_desc: d, status: 'Active',
          brand: $('aBrand').value.trim() || 'Lucas', supplier_pn: $('aSup').value.trim() || null, origin: $('aOrigin').value.trim() || null }));
        var oe = $('aOe').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (oe.length) L.must(await sb.from('oe_numbers').upsert(oe.map(function (n, i) { return { lucas_pn: pn, oe_number: n, is_primary: i === 0 }; }), { onConflict: 'lucas_pn,oe_number', ignoreDuplicates: true }));
        L.toast(pn + ' created');
        if (!$('tab-parts').hidden) { $('ptRange').value = c.subcategory_key; load(0); }
        openPart(pn);
      } catch (e) { L.fail(e); }
    };
  };

  // ---------- upload parts (data team) ----------
  async function importParts(f) {
    try {
      var raw = await L.readSheet(f), byKey = {}, bad = [];
      L.CATS.forEach(function (c) { byKey[c.subcategory_key.toLowerCase()] = c; byKey[c.name.toLowerCase()] = c; });
      var rows = raw.map(function (o, i) {
        var rg = L.pick(o, ['range', 'subcategory', 'category', 'productrange']);
        return { line: i + 2, lucas_pn: L.clean(L.pick(o, L.PN_COLS)), cat: rg ? byKey[rg.toLowerCase()] : null, rangeText: rg,
          short_desc: L.pick(o, ['description', 'shortdesc', 'desc', 'shortdescription']), status: L.pick(o, ['status']),
          brand: L.pick(o, ['brand']), origin: L.pick(o, ['origin', 'countryoforigin']), barcode: L.pick(o, ['barcode', 'ean']), notes: L.pick(o, ['notes', 'note', 'remarks']),
          supplier_pn: L.pick(o, ['supplierpn', 'supplierpartnumber']), hs_code: L.pick(o, ['hscode', 'hs']), oe: L.pick(o, ['oenumbers', 'oenumber', 'oe']) };
      }).filter(function (r) { return r.lucas_pn; });
      if (!rows.length) return L.toast('No rows with a Lucas PN column found');
      var existing = {};
      for (var ch of L.chunks(rows.map(function (r) { return r.lucas_pn; }), 300)) L.must(await sb.from('products').select('*').in('lucas_pn', ch)).forEach(function (p) { existing[p.lucas_pn] = p; });
      rows.forEach(function (r) {
        var ex = existing[r.lucas_pn];
        if (r.rangeText && !r.cat) bad.push('Row ' + r.line + ': range "' + r.rangeText + '" is not one of ' + L.CATS.map(function (c) { return c.name; }).join(', '));
        else if (!ex && !r.cat) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is new, so it needs a range');
        else if (!ex && !r.short_desc) bad.push('Row ' + r.line + ': ' + r.lucas_pn + ' is new, so it needs a description');
        if (r.status && !/^(active|inactive)$/i.test(r.status)) bad.push('Row ' + r.line + ': status must be Active or Inactive');
      });
      var nNew = rows.filter(function (r) { return !existing[r.lucas_pn]; }).length;
      L.drawer('<h1>Upload parts</h1><p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows, <b>' + nNew + '</b> new parts, <b>' + (rows.length - nNew) + '</b> updates to existing parts. Blank cells leave the current value unchanged.</p>' +
        (bad.length ? '<p class="flag">Fix these first (' + bad.length + '):</p><ul>' + bad.slice(0, 40).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        '<p class="muted small">Columns read: Lucas PN, Range, Description, Status, Brand, Origin, Barcode, Supplier PN, HS code, Notes, OE numbers (several separated by commas).</p>' +
        '<div class="actions"><button class="btn" id="impGo"' + (bad.length ? ' disabled' : '') + '>Upload ' + rows.length + ' parts</button></div>');
      $('impGo').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Uploading…';
        try {
          var F = ['short_desc', 'status', 'brand', 'origin', 'barcode', 'notes', 'supplier_pn', 'hs_code'];
          var up = rows.map(function (r) {
            var ex = existing[r.lucas_pn] || {}, o = { lucas_pn: r.lucas_pn, category: r.cat ? r.cat.group_name : ex.category, subcategory: r.cat ? r.cat.subcategory_key : ex.subcategory };
            F.forEach(function (k) { var v = r[k]; if (k === 'status' && v) v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); o[k] = v !== '' ? v : (ex[k] != null ? ex[k] : (k === 'status' ? 'Active' : k === 'brand' ? 'Lucas' : null)); });
            return o;
          });
          for (var c of L.chunks(up, 500)) L.must(await sb.from('products').upsert(c, { onConflict: 'lucas_pn' }));
          var oe = []; rows.forEach(function (r) { r.oe.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) { oe.push({ lucas_pn: r.lucas_pn, oe_number: n }); }); });
          for (var c2 of L.chunks(oe, 500)) L.must(await sb.from('oe_numbers').upsert(c2, { onConflict: 'lucas_pn,oe_number', ignoreDuplicates: true }));
          L.toast('Uploaded ' + rows.length + ' parts' + (oe.length ? ' and ' + oe.length + ' OE numbers' : '')); L.closeDrawer(); load(0);
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Try again'; }
      };
    } catch (e) { L.fail(e); }
  }

  // ---------- prices: coverage, template, upload ----------
  async function coverage() {
    L.drawer('<h1>Price coverage</h1><p class="muted">Active parts with an FOB price, per range. FOB is the price inquiries are calculated with.</p><div class="tablewrap"><table class="grid" id="cvTable"><tbody><tr><td class="empty">Loading…</td></tr></tbody></table></div>' +
      '<h3>Price list template</h3><p class="muted small">Parts of a range with their current prices, ready to fill in and upload with "Upload prices".</p>' +
      '<div class="toolbar"><select id="cvRange">' + L.rangeOptions() + '</select><label class="check"><input type="checkbox" id="cvMissing" checked> Only parts without an FOB price</label><button class="btn ghost" id="cvTpl">Download template</button></div>');
    $('cvRange').value = $('ptRange').value;
    $('cvTpl').onclick = function () { template($('cvRange').value, $('cvMissing').checked).catch(L.fail); };
    try {
      var res = await Promise.all([L.fetchAll(function () { return sb.from('products').select('lucas_pn,subcategory,status').order('lucas_pn'); }), L.fetchAll(function () { return sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd').order('lucas_pn'); })]);
      var price = {}; res[1].forEach(function (p) { price[p.lucas_pn] = p; });
      var by = {}; res[0].forEach(function (p) { if (p.status !== 'Active') return; var b = by[p.subcategory] = by[p.subcategory] || { n: 0, fob: 0, exw: 0 }; b.n++; var pr = price[p.lucas_pn]; if (pr && pr.fob_usd != null) b.fob++; if (pr && pr.exw_usd != null) b.exw++; });
      var tot = { n: 0, fob: 0, exw: 0 };
      $('cvTable').innerHTML = '<thead><tr><th>Range</th><th class="num">Active parts</th><th class="num">With FOB price</th><th class="num">Missing FOB</th><th class="num">With EXW price</th></tr></thead><tbody>' +
        L.CATS.map(function (c) { var b = by[c.subcategory_key] || { n: 0, fob: 0, exw: 0 }; tot.n += b.n; tot.fob += b.fob; tot.exw += b.exw;
          return '<tr><td>' + esc(c.name) + '</td><td class="num">' + b.n.toLocaleString() + '</td><td class="num">' + b.fob.toLocaleString() + '</td><td class="num">' + (b.n - b.fob ? '<span class="flag">' + (b.n - b.fob).toLocaleString() + '</span>' : '0') + '</td><td class="num">' + b.exw.toLocaleString() + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + tot.n.toLocaleString() + '</td><td class="num">' + tot.fob.toLocaleString() + '</td><td class="num">' + (tot.n - tot.fob).toLocaleString() + '</td><td class="num">' + tot.exw.toLocaleString() + '</td></tr></tfoot>';
    } catch (e) { L.fail(e); }
  }
  async function template(sub, onlyMissing) {
    var c = L.CATS.find(function (x) { return x.subcategory_key === sub; });
    var res = await Promise.all([L.fetchAll(function () { return sb.from('products').select('lucas_pn,short_desc,status').eq('subcategory', sub).order('lucas_pn'); }), L.fetchAll(function () { return sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd,price_list').order('lucas_pn'); })]);
    var pr = {}; res[1].forEach(function (p) { pr[p.lucas_pn] = p; });
    var rows = res[0].filter(function (p) { return p.status === 'Active' && (!onlyMissing || !pr[p.lucas_pn] || pr[p.lucas_pn].fob_usd == null); });
    if (!rows.length) return L.toast('Every active ' + c.name.toLowerCase() + ' part already has an FOB price');
    await L.saveXlsx([{ name: 'Prices', widths: [12, 60, 14, 10, 10, 16], head: ['Lucas PN', 'Description', 'Range', 'FOB USD', 'EXW USD', 'Price list'],
      rows: rows.map(function (p) { var x = pr[p.lucas_pn] || {}; return [p.lucas_pn, p.short_desc, c.name, x.fob_usd == null ? '' : Number(x.fob_usd), x.exw_usd == null ? '' : Number(x.exw_usd), x.price_list || '']; }) }],
      'Lucas_prices_' + c.name.replace(/\s+/g, '_') + '.xlsx');
  }
  async function uploadPrices(f) {
    L.drawer('<h1>Upload prices</h1><p class="muted">Reading ' + esc(f.name) + '…</p>');
    try {
      var raw = await L.readSheet(f), bad = [];
      var rows = raw.map(function (o, i) {
        return { line: i + 2, lucas_pn: L.clean(L.pick(o, L.PN_COLS)), fob: L.num(L.pick(o, ['fobusd', 'fob', 'fobprice', 'fobpriceusd', 'fobusdprice'])),
          exw: L.num(L.pick(o, ['exwusd', 'exw', 'exwprice', 'exwpriceusd'])), list: L.pick(o, ['pricelist', 'pricelistname', 'list']) };
      }).filter(function (r) { return r.lucas_pn && (r.fob != null || r.exw != null || r.list); });
      if (!rows.length) return L.drawer('<h1>Upload prices</h1><p class="flag">No rows with a Lucas PN and a price were found. The columns must be called "Lucas PN" and "FOB USD" (optional: "EXW USD", "Price list").</p>');
      rows.forEach(function (r) { if (Number.isNaN(r.fob) || Number.isNaN(r.exw)) bad.push('Row ' + r.line + ' (' + r.lucas_pn + '): price is not a number'); else if ((r.fob != null && r.fob < 0) || (r.exw != null && r.exw < 0)) bad.push('Row ' + r.line + ': negative price'); });
      var known = {}, cur = {};
      for (var ch of L.chunks(rows.map(function (r) { return r.lucas_pn; }), 300)) {
        L.must(await sb.from('products').select('lucas_pn,short_desc').in('lucas_pn', ch)).forEach(function (p) { known[p.lucas_pn] = p.short_desc; });
        L.must(await sb.from('product_pricing').select('lucas_pn,fob_usd,exw_usd,price_list').in('lucas_pn', ch)).forEach(function (p) { cur[p.lucas_pn] = p; });
      }
      var unknown = rows.filter(function (r) { return !(r.lucas_pn in known); });
      var ok = rows.filter(function (r) { return r.lucas_pn in known && !Number.isNaN(r.fob) && !Number.isNaN(r.exw); });
      var changed = ok.filter(function (r) { var c = cur[r.lucas_pn] || {}; return (r.fob != null && Number(c.fob_usd) !== r.fob) || (r.exw != null && Number(c.exw_usd) !== r.exw) || (r.list && r.list !== c.price_list); });
      L.drawer('<h1>Upload prices</h1><p>' + esc(f.name) + ': <b>' + rows.length + '</b> rows, <b>' + changed.length + '</b> prices will change, ' + (ok.length - changed.length) + ' unchanged' + (unknown.length ? ', <span class="flag">' + unknown.length + ' part numbers not in the database (skipped)</span>' : '') + '. Blank cells never remove a price.</p>' +
        (bad.length ? '<p class="flag">Fix these first:</p><ul>' + bad.slice(0, 30).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        (unknown.length ? '<p class="small muted">Not found: ' + esc(unknown.slice(0, 40).map(function (r) { return r.lucas_pn; }).join(', ')) + (unknown.length > 40 ? '…' : '') + '</p>' : '') +
        (changed.length ? '<div class="tablewrap" style="max-height:50vh"><table class="grid"><thead><tr><th>Lucas PN</th><th>Description</th><th class="num">FOB now</th><th class="num">FOB new</th><th class="num">EXW now</th><th class="num">EXW new</th></tr></thead><tbody>' +
          changed.slice(0, 300).map(function (r) { var c = cur[r.lucas_pn] || {}; return '<tr><td class="pn">' + esc(r.lucas_pn) + '</td><td class="clip">' + esc(known[r.lucas_pn]) + '</td><td class="num">' + L.money(c.fob_usd) + '</td><td class="num"><b>' + (r.fob == null ? L.money(c.fob_usd) : L.money(r.fob)) + '</b></td><td class="num">' + L.money(c.exw_usd) + '</td><td class="num">' + (r.exw == null ? L.money(c.exw_usd) : L.money(r.exw)) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '') +
        '<div class="actions"><button class="btn" id="prApply"' + (bad.length || !changed.length ? ' disabled' : '') + '>Update ' + changed.length + ' prices</button></div>');
      $('prApply').onclick = async function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Updating…';
        try {
          var up = changed.map(function (r) { var c = cur[r.lucas_pn] || {};
            return { lucas_pn: r.lucas_pn, fob_usd: r.fob != null ? r.fob : (c.fob_usd != null ? c.fob_usd : null), exw_usd: r.exw != null ? r.exw : (c.exw_usd != null ? c.exw_usd : null), price_list: r.list || c.price_list || null }; });
          for (var c of L.chunks(up, 500)) L.must(await sb.from('product_pricing').upsert(c, { onConflict: 'lucas_pn' }));
          L.toast('Updated ' + up.length + ' prices'); L.closeDrawer(); load(0);
        } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Try again'; }
      };
    } catch (e) { L.fail(e); }
  }

  L.modules.parts = {
    init: function () {
      $('ptRange').innerHTML = L.rangeOptions();
      $('ptSearch').addEventListener('input', L.debounce(function () { load(0); }));
      ['ptRange', 'ptStatus', 'ptPrice'].forEach(function (id) { $(id).addEventListener('change', function () { load(0); }); });
      $('ptTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-pn]'); if (tr) openPart(tr.dataset.pn); });
      $('ptExport').addEventListener('click', exportRange);
      $('ptCoverage').addEventListener('click', coverage);
      $('ptAdd').addEventListener('click', function () { L.addPartForm(); });
      $('ptImport').addEventListener('click', function () { L.pickFile(importParts); });
      $('ptPrices').addEventListener('click', function () { L.pickFile(uploadPrices); });
      load(0);
    }
  };
})(window.LS);
