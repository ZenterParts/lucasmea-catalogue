/* App: Part numbers. Interface ready; the numbering rules plug into LS.partNumberRule */
(function (L) {
  'use strict';
  var esc = L.esc, sb = L.sb, $ = L.$;
  var BASE = L.href('partno');

  /* ===== numbering rules: to be provided by the data team =====
     input: { range, group, type, brand, supplier_pn, origin, description, oe:[...] }
     existing: all current Lucas part numbers of that range (sorted)
     return the new part number as a string, or null while no rule is defined. */
  L.partNumberRule = function (input, existing) {   // eslint-disable-line no-unused-vars
    return null;
  };

  async function existingFor(range) {
    return (await L.fetchAll(function () { return sb.from('products').select('lucas_pn').eq('subcategory', range).order('lucas_pn'); })).map(function (r) { return r.lucas_pn; });
  }

  function single() {
    L.form({
      crumbs: [['Part numbers', BASE], ['New part number']],
      buttons: '<button type="button" class="btn editor-only" id="pnGen">Generate part number</button><button type="button" class="btn ghost" id="pnReset">Discard</button>',
      sheet: '<div class="o-title"><h1>New part number</h1>' + L.pill('Numbering rules to be added', 'New') + '</div><div class="o-subtitle">Fill in the product, then generate its Lucas part number. The rules will be added by the data team; until then Generate shows what it would use.</div>' +
        '<div class="o-groups">' + L.group('Product', [['Range', '<select id="pnRange">' + L.rangeOptions() + '</select><div class="small muted" id="pnHint" style="margin-top:4px"></div>'], ['Product type', '<input id="pnType" placeholder="e.g. Spin-on oil filter">'], ['Description', '<input id="pnDesc">'], ['Brand', '<input id="pnBrand" value="Lucas">']]) +
        L.group('Source', [['Supplier part no.', '<input id="pnSupplier">'], ['Origin', '<input id="pnOrigin" placeholder="e.g. China">'], ['OE / references', '<textarea id="pnOe" rows="3" placeholder="One per line"></textarea>']]) + '</div><div id="pnOut"></div>'
    });
    $('pnReset').onclick = single;
    var hint = async function () {
      try {
        var c = L.cat($('pnRange').value), rows = L.must(await sb.from('pn_sequences').select('prefix,last_pn,next_pn').ilike('subcategory', '%' + c.subcategory_key + '%'));
        $('pnHint').innerHTML = rows.length ? rows.map(function (r) { return '<span class="mono">' + esc(r.prefix) + '</span>: last <span class="mono">' + esc(r.last_pn) + '</span>, next free <b class="mono ok">' + esc(r.next_pn) + '</b>'; }).join('<br>') : '';
      } catch (e) { $('pnHint').textContent = ''; }
    };
    $('pnRange').addEventListener('change', hint); hint();
    $('pnGen').onclick = async function () {
      var c = L.cat($('pnRange').value), out = $('pnOut');
      var input = { range: c.subcategory_key, group: c.group_name, type: $('pnType').value.trim(), brand: $('pnBrand').value.trim(), supplier_pn: $('pnSupplier').value.trim(), origin: $('pnOrigin').value.trim(), description: $('pnDesc').value.trim(),
        oe: $('pnOe').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean) };
      if (!input.description) { out.innerHTML = '<div class="notice bad">Add at least a description.</div>'; return; }
      try {
        var existing = await existingFor(input.range), pn = L.partNumberRule(input, existing);
        if (!pn) { out.innerHTML = '<div class="notice"><b>Numbering rules not set yet.</b> Once the data team provides them, the new number appears here with a duplicate check and a "Create part" button.<br><span class="muted small">' + esc(c.name) + ' currently has ' + existing.length.toLocaleString() + ' part numbers' + (existing.length ? ', the last being ' + esc(existing[existing.length - 1]) : '') + '.</span></div>'; return; }
        pn = L.clean(pn);
        var taken = existing.indexOf(pn) >= 0 || !!L.must(await sb.from('products').select('lucas_pn').eq('lucas_pn', pn).maybeSingle());
        out.innerHTML = '<div class="notice ' + (taken ? 'bad' : 'good') + '">Proposed part number <b class="big">' + esc(pn) + '</b>' + (taken ? ' <span class="flag">already exists</span>' : '') + '</div>' + (taken ? '' : '<div class="o-footer"><button class="btn" id="pnCreate">Create part ' + esc(pn) + '</button></div>');
        if (!taken) $('pnCreate').onclick = function () { L.addPartForm({ lucas_pn: pn, subcategory: input.range, short_desc: input.description, brand: input.brand, supplier_pn: input.supplier_pn, origin: input.origin, oe: input.oe }); };
      } catch (e) { L.fail(e); }
    };
  }

  function bulk() {
    L.cp({ crumbs: [['Part numbers', BASE], ['Many at once']], buttons: '<button type="button" class="btn editor-only" id="pbUp">Upload a list</button><button type="button" class="btn ghost" id="pbTpl">Download template</button>' });
    L.content('<div class="card"><p class="muted">Upload an Excel or CSV with Range, Product type, Supplier part number, Description and OE numbers. Each row gets a proposed Lucas part number to review before the parts are created.</p><div id="pbOut"></div></div>');
    $('pbTpl').onclick = function () { L.saveXlsx([{ name: 'New parts', widths: [14, 24, 18, 50, 30, 10, 12], head: ['Range', 'Product type', 'Supplier PN', 'Description', 'OE numbers', 'Brand', 'Origin'], rows: [[L.CATS[0].name, '', '', '', '', 'Lucas', '']] }], 'Lucas_new_part_numbers_template.xlsx').catch(L.fail); };
    $('pbUp').onclick = function () {
      L.pickFile(async function (f) {
        try {
          var raw = await L.readSheet(f), byKey = {};
          var withPn = raw.filter(function (o) { return L.clean(L.pick(o, L.PN_COLS)); }).length;
          if (withPn && L.importParts) {   // the sheet already has Lucas part numbers: it is an upload, not a numbering request
            $('pbOut').innerHTML = '<div class="notice"><b>' + esc(f.name) + ' already has Lucas part numbers</b> in ' + withPn + ' rows, so there is nothing to number here. ' +
              'To create these parts with their OE numbers, cross references, specifications and makes, upload it to the database.</div><div class="o-footer"><button class="btn editor-only" id="pbToUpload">Upload these parts</button></div>';
            $('pbToUpload').onclick = function () { L.importParts(f); };
            return;
          }
          L.CATS.forEach(function (c) { byKey[c.subcategory_key.toLowerCase()] = c; byKey[c.name.toLowerCase()] = c; });
          var rows = raw.map(function (o) {
            var c = byKey[(L.pick(o, ['range', 'subcategory', 'category']) || '').toLowerCase()];
            return { range: c ? c.subcategory_key : '', type: L.pick(o, ['producttype', 'type']), supplier_pn: L.pick(o, ['supplierpn', 'supplierpartnumber', 'supplierpartno']), description: L.pick(o, ['description', 'desc']),
              oe: L.pick(o, ['oenumbers', 'oenumber', 'oe']).split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean), brand: L.pick(o, ['brand']) || 'Lucas', origin: L.pick(o, ['origin']) };
          }).filter(function (r) { return r.description || r.supplier_pn; });
          var cache = {}, prop = [];
          for (var r of rows) { if (r.range && !cache[r.range]) cache[r.range] = await existingFor(r.range); prop.push(r.range ? L.partNumberRule(r, cache[r.range]) : null); }
          $('pbOut').innerHTML = '<p><b>' + rows.length + '</b> rows read from ' + esc(f.name) + '.' + (prop.every(function (p) { return !p; }) ? ' <span class="muted">Proposed numbers appear once the numbering rules are set.</span>' : '') + '</p>' +
            L.listView([{ label: 'Range', render: function (x) { return x.range ? esc(x.range) : '<span class="flag">unknown range</span>'; } }, { label: 'Type', render: function (x) { return esc(x.type); } }, { label: 'Supplier PN', render: function (x) { return esc(x.supplier_pn); } },
              { label: 'Description', cls: 'clip', render: function (x) { return esc(x.description); } }, { label: 'Proposed Lucas PN', cls: 'pn', render: function (x) { var p = prop[rows.indexOf(x)]; return p ? esc(p) : '<span class="muted">pending rules</span>'; } }], rows.slice(0, 1000));
        } catch (e) { L.fail(e); }
      });
    };
  }

  async function ranges() {
    L.cp({ crumbs: [['Part numbers', BASE], ['Numbering by range']] });
    try {
      var rows = L.must(await sb.from('pn_sequences').select('*'));
      var last = {}; if (rows.length) L.must(await sb.from('products').select('lucas_pn,short_desc').in('lucas_pn', rows.map(function (r) { return r.last_pn; }))).forEach(function (p) { last[p.lucas_pn] = p.short_desc; });
      var order = {}; L.CATS.forEach(function (c, i) { order[c.subcategory_key] = i; });
      rows.sort(function (a, b) { return (order[a.subcategory] != null ? order[a.subcategory] : 99) - (order[b.subcategory] != null ? order[b.subcategory] : 99) || a.prefix.localeCompare(b.prefix); });
      L.content('<p class="muted">One line per part-number prefix. <b>Next free</b> continues after the highest number in use. Numbers missing below it are counted but not reused, as they may belong to retired parts.</p>' + L.listView([
        { label: 'Range', render: function (r) { return esc(r.subcategory); } },
        { label: 'Prefix', render: function (r) { return '<span class="mono">' + esc(r.prefix) + '</span>'; } },
        { label: 'Product (last part)', cls: 'clip', render: function (r) { return esc(last[r.last_pn] || ''); } },
        { label: 'Parts', num: true, render: function (r) { return L.qty(r.parts); } },
        { label: 'Last part no. used', cls: 'pn', render: function (r) { return '<a href="' + L.href('parts', ['p', r.last_pn]) + '" class="mono">' + esc(r.last_pn) + '</a>'; } },
        { label: 'Next free part no.', render: function (r) { return '<b class="mono ok">' + esc(r.next_pn) + '</b> <button type="button" class="link small" data-copy="' + esc(r.next_pn) + '">copy</button>'; } },
        { label: 'Unused below last', render: function (r) { return r.unused_below_last ? L.qty(r.unused_below_last) + ' <span class="muted small">(first: <span class="mono">' + esc(r.first_unused_pn) + '</span>)</span>' : '<span class="muted">none</span>'; } },
        { label: 'Last added', render: function (r) { return '<span class="small">' + esc(L.dt(r.last_added)) + '</span>'; } }
      ], rows));
      $('content').querySelector('.o-list').addEventListener('click', function (e) {
        var b = e.target.closest('[data-copy]'); if (!b) return;
        var t = b.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { L.toast(t + ' copied'); }, function () { L.toast(t); });
      });
    } catch (e) { L.fail(e); }
  }

  L.register({
    key: 'partno', name: 'Part Numbers', color: '#c77d0a',
    icon: '<path d="M4 9h16M4 15h16M10 4L8 20M16 4l-2 16"/>',
    menus: [{ label: 'New part number', href: BASE }, { label: 'Many at once', href: L.href('partno', ['bulk']) }, { label: 'Numbering by range', href: L.href('partno', ['ranges']) }],
    route: function (r) { if (r.parts[0] === 'bulk') bulk(); else if (r.parts[0] === 'ranges') ranges(); else single(); }
  });
})(window.LS);
