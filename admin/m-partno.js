/* Module 4: Part number creation. Interface ready; the numbering rules plug into LS.partNumberRule */
(function (L) {
  'use strict';
  var $ = L.$, esc = L.esc, sb = L.sb;

  /* ===== numbering rules: to be provided by the data team =====
     Receives { range, group, type, brand, supplier_pn, origin, description, oe:[...] } plus `existing`
     (all current Lucas part numbers of that range) and returns the new part number as a string,
     or null while no rule is defined. */
  L.partNumberRule = function (input, existing) {   // eslint-disable-line no-unused-vars
    return null;
  };

  function readForm() {
    var c = L.CATS.find(function (x) { return x.subcategory_key === $('pnRange').value; }) || {};
    return { range: c.subcategory_key, group: c.group_name, type: $('pnType').value.trim(), brand: $('pnBrand').value.trim(), supplier_pn: $('pnSupplier').value.trim(),
      origin: $('pnOrigin').value.trim(), description: $('pnDesc').value.trim(), oe: $('pnOe').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean) };
  }
  async function existingFor(range) {
    var rows = await L.fetchAll(function () { return sb.from('products').select('lucas_pn').eq('subcategory', range).order('lucas_pn'); });
    return rows.map(function (r) { return r.lucas_pn; });
  }
  async function generate() {
    var input = readForm(), out = $('pnOut');
    if (!input.description) { out.innerHTML = '<p class="msg err">Add at least a description.</p>'; return; }
    try {
      var existing = await existingFor(input.range), pn = L.partNumberRule(input, existing);
      if (!pn) {
        out.innerHTML = '<div class="notice"><b>Numbering rules not set yet.</b> Once the data team provides them, the new number appears here. The form, the duplicate check and "Create part" are ready.' +
          '<br><span class="muted small">Current numbers in ' + esc(input.range) + ': ' + existing.length.toLocaleString() + (existing.length ? ' (last: ' + esc(existing[existing.length - 1]) + ')' : '') + '.</span></div>';
        return;
      }
      pn = L.clean(pn);
      var taken = existing.indexOf(pn) >= 0 || !!L.must(await sb.from('products').select('lucas_pn').eq('lucas_pn', pn).maybeSingle());
      out.innerHTML = '<div class="notice ' + (taken ? 'bad' : 'good') + '">Proposed part number <b class="big">' + esc(pn) + '</b>' + (taken ? ' <span class="flag">already exists</span>' : '') + '</div>' +
        (taken ? '' : '<div class="row-actions"><button class="btn" id="pnCreate">Create part ' + esc(pn) + '</button></div>');
      if (!taken) $('pnCreate').onclick = function () {
        L.openTab('parts');
        L.addPartForm({ lucas_pn: pn, subcategory: input.range, short_desc: input.description, brand: input.brand, supplier_pn: input.supplier_pn, origin: input.origin, oe: input.oe });
      };
    } catch (e) { L.fail(e); }
  }

  async function bulk(f) {
    try {
      var raw = await L.readSheet(f), byKey = {};
      L.CATS.forEach(function (c) { byKey[c.subcategory_key.toLowerCase()] = c; byKey[c.name.toLowerCase()] = c; });
      var rows = raw.map(function (o) {
        var c = byKey[(L.pick(o, ['range', 'subcategory', 'category']) || '').toLowerCase()];
        return { range: c ? c.subcategory_key : '', type: L.pick(o, ['producttype', 'type']), supplier_pn: L.pick(o, ['supplierpn', 'supplierpartnumber', 'supplierpartno']),
          description: L.pick(o, ['description', 'desc']), oe: L.pick(o, ['oenumbers', 'oenumber', 'oe']).split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean), brand: L.pick(o, ['brand']) || 'Lucas', origin: L.pick(o, ['origin']) };
      }).filter(function (r) { return r.description || r.supplier_pn; });
      var cache = {}, proposals = [];
      for (var r of rows) { if (r.range && !cache[r.range]) cache[r.range] = await existingFor(r.range); proposals.push(r.range ? L.partNumberRule(r, cache[r.range]) : null); }
      $('pnBulk').innerHTML = '<p>' + rows.length + ' rows read.' + (proposals.every(function (p) { return !p; }) ? ' <span class="muted">Proposed numbers will appear once the numbering rules are set.</span>' : '') + '</p>' +
        '<div class="tablewrap" style="max-height:300px"><table class="grid"><thead><tr><th>Range</th><th>Type</th><th>Supplier PN</th><th>Description</th><th>Proposed Lucas PN</th></tr></thead><tbody>' +
        rows.slice(0, 500).map(function (r, i) { return '<tr><td>' + (r.range ? esc(r.range) : '<span class="flag">unknown range</span>') + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.supplier_pn) + '</td><td class="clip">' + esc(r.description) + '</td><td class="pn">' + (proposals[i] ? esc(proposals[i]) : '<span class="muted">pending rules</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
    } catch (e) { L.fail(e); }
  }

  async function reference() {
    try {
      var rows = L.must(await sb.from('category_overview').select('name,item_count,prefixes,last_added,sort_order').eq('status', 'live').order('sort_order'));
      $('pnRef').innerHTML = '<thead><tr><th>Range</th><th class="num">Parts</th><th>Prefixes in use</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="num">' + L.qty(r.item_count) + '</td><td class="small">' + esc(r.prefixes || '') + '</td></tr>'; }).join('') + '</tbody>';
    } catch (e) { L.fail(e); }
  }

  L.modules.partno = {
    init: function () {
      $('pnRange').innerHTML = L.rangeOptions();
      $('pnGen').addEventListener('click', generate);
      $('pnFile').addEventListener('change', function () { if (this.files[0]) bulk(this.files[0]); });
      reference();
    }
  };
})(window.LS);
