/* App: Stravik Products. Stravik-brand parts (separate from the Lucas catalogue), starting with Filters.
   Tables: stravik_products, stravik_pricing (costs, landed cost, margins and prices per region), stravik_history (automatic change log).
   Everyone on the staff list can view and download; the data team edits. Nothing here is public. */
(function (L) {
  'use strict';
  var esc = L.esc, sb = L.sb, $ = L.$;
  var BASE = L.href('stravik');
  var TYPES = [['AFL', 'Air Filters'], ['OFL', 'Oil Filters'], ['FFL', 'Fuel Filters'], ['CFL', 'Cabin Filters'], ['FKT', 'Filter Kits'], ['CLF', 'Coolant Filters'], ['FHS', 'Filter Housings']];
  var TYPE_NAME = {}; TYPES.forEach(function (t) { TYPE_NAME[t[0]] = t[1]; });
  var REGIONS = [['north_africa', 'North Africa'], ['east_africa', 'East Africa'], ['west_africa', 'West Africa'], ['central_africa', 'Central Africa'],
    ['southern_africa', 'Southern Africa'], ['ocean_islands', 'Ocean Islands'], ['gcc', 'GCC'], ['middle_east', 'Middle East']];
  var COSTS = [['c_cons', 'Consolidation'], ['c_finance', 'Finance'], ['c_ship', 'Shipping'], ['c_ins', 'Insurance'], ['c_whs', 'Warehousing'], ['c_war', 'Warranty'],
    ['c_mark', 'Marketing'], ['c_roy', 'Royalty'], ['c_customer_disc', 'Customer discount']];
  var PRODUCT_FIELDS = [
    ['Product', [['status', 'Status', 'select:Proposed,Active,Inactive'], ['filter_type', 'Filter type'], ['description', 'Description', 'area'], ['product_category', 'Product category'],
      ['product_type', 'Product type'], ['product_subcategory', 'Subcategory'], ['on_website', 'Show on Stravik website', 'bool']]],
    ['Supplier', [['supplier_pn', 'Supplier PN'], ['manufacturer', 'Supplier / manufacturer'], ['origin', 'Origin'], ['enquiry', 'Market / enquiry', 'area'], ['moq', 'MOQ']]],
    ['Vehicles', [['make', 'Make'], ['model', 'Model', 'area'], ['year_range', 'Years'], ['engine', 'Engine / type']]],
    ['Numbers and specifications', [['oe_numbers', 'OE numbers', 'area'], ['competitor_numbers', 'Cross references', 'area'], ['tech_specs', 'Technical specifications', 'area']]]
  ];
  var MASTER_FIELDS = [['gtin', 'GTIN / UPC'], ['hs_code', 'HS code'], ['barcode', 'Barcode'], ['net_weight_kg', 'Net weight (kg)', 'num'], ['gross_weight_kg', 'Gross weight (kg)', 'num'],
    ['dimensions_mm', 'Product dimensions (mm)'], ['units_per_box', 'Units per box', 'num'], ['units_per_carton', 'Units per carton', 'num'], ['carton_dims_mm', 'Carton dimensions (mm)'],
    ['cartons_per_pallet', 'Cartons per pallet', 'num'], ['pallet_dims_mm', 'Pallet dimensions (mm)'], ['pallet_gross_kg', 'Pallet gross weight (kg)', 'num'],
    ['image_url', 'Product image (link)'], ['features', 'Product features', 'area'], ['certifications', 'Certifications'], ['compliance', 'Regulatory compliance'], ['sds_url', 'Safety data sheet (link)']];
  var NOTE_FIELDS = [['numbering_note', 'Numbering note', 'area'], ['remarks', 'Remarks', 'area'], ['price_list_rows', 'Price list row(s)']];

  var S = L.state.stravik = { type: '', text: '', active: {}, offset: 0 };
  var FILTERS = [{ key: 's_prop', label: 'Proposed', group: 'Status', single: true }, { key: 's_act', label: 'Active', group: 'Status', single: true },
    { key: 'n_sup', label: 'No supplier PN', group: 'Data', single: false }, { key: 'n_veh', label: 'No vehicle make', group: 'Data' }, { key: 'n_oe', label: 'No OE number', group: 'Data' },
    { key: 'w_off', label: 'Hidden from website', group: 'Website', single: true }];

  var money = function (v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }); };
  var pct = function (v) { return v == null || v === '' ? '' : (Number(v) * 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%'; };

  function query(opts) {
    var q = sb.from('stravik_filters').select(opts && opts.head ? 'sv_pn' : '*', opts);
    if (S.type) q = q.eq('category_code', S.type);
    var A = S.active;
    if (A.s_prop) q = q.eq('status', 'Proposed'); if (A.s_act) q = q.eq('status', 'Active');
    if (A.n_sup) q = q.or('supplier_pn.is.null,supplier_pn.eq.Not Available');
    if (A.n_veh) q = q.is('make', null); if (A.n_oe) q = q.is('oe_numbers', null);
    if (A.w_off) q = q.eq('on_website', false);
    var s = L.orSearch(['sv_pn', 'supplier_pn', 'description', 'oe_numbers', 'competitor_numbers', 'make', 'model', 'enquiry'], S.text); if (s) q = q.or(s);
    return q.order('sv_pn');
  }

  function list(r) {
    if (r.q.type != null) { S.type = r.q.type === 'all' ? '' : r.q.type; S.offset = 0; }
    L.cp({ crumbs: [['Stravik Products', BASE], ['Filters', BASE], S.type ? [TYPE_NAME[S.type] || S.type] : ['All filters']],
      buttons: '<button type="button" class="btn ghost" id="svXls">Download</button>' });
    L.searchBar({ placeholder: 'Search SV no., supplier PN, OE, cross reference, vehicle…', text: S.text, filters: FILTERS, active: S.active, onChange: function (s) { S.text = s.text; S.active = s.active; S.offset = 0; load(); } });
    L.content('<div class="cards" id="svStats" style="margin-bottom:14px"></div><div class="o-with-panel"><nav class="o-panel" id="svPanel"><div class="o-panel-title">Filter type</div></nav><div id="svList"></div></div>');
    $('svXls').onclick = excel;
    panel(); load();
  }
  async function panel() {
    try {
      var rows = await L.fetchAll(function () { return sb.from('stravik_products').select('category_code,status').eq('product_line', 'Filters'); });
      var n = {}; rows.forEach(function (x) { n[x.category_code] = (n[x.category_code] || 0) + 1; });
      $('svPanel').innerHTML = '<div class="o-panel-title">Filter type</div><a href="' + L.href('stravik', [], { type: 'all' }) + '" class="' + (!S.type ? 'on' : '') + '">All filters <small>' + rows.length + '</small></a>' +
        TYPES.map(function (t) { return '<a href="' + L.href('stravik', [], { type: t[0] }) + '" class="' + (S.type === t[0] ? 'on' : '') + '">' + esc(t[1]) + ' <small>' + (n[t[0]] || 0) + '</small></a>'; }).join('');
      var prop = rows.filter(function (x) { return x.status === 'Proposed'; }).length;
      $('svStats').innerHTML = [[rows.length, 'Stravik filter part numbers'], [TYPES.filter(function (t) { return n[t[0]]; }).length, 'filter types'], [prop, 'still "Proposed" (not yet approved)']]
        .map(function (s) { return '<div class="card"><div class="stat">' + Number(s[0]).toLocaleString() + '</div><div class="stat-l">' + esc(s[1]) + '</div></div>'; }).join('');
    } catch (e) { L.fail(e); }
  }
  async function load() {
    try {
      var res = await query({ count: 'exact' }).range(S.offset, S.offset + L.PAGE - 1), rows = L.must(res);
      L.pager(S.offset, res.count || 0, function (o) { S.offset = o; load(); });
      if (!rows.length) { $('svList').innerHTML = L.empty('No filters match', 'Change the search or the filters.'); return; }
      $('svList').innerHTML = L.listView([
        { label: 'Stravik PN', cls: 'pn', render: function (x) { return esc(x.sv_pn); } },
        { label: 'Type', render: function (x) { return '<span style="white-space:nowrap">' + esc(x.filter_type || '') + '</span>'; } },
        { label: 'Description', cls: 'clip', render: function (x) { return esc(x.description || ''); } },
        { label: 'Supplier PN', cls: 'clip', render: function (x) { return esc(x.supplier_pn || ''); } },
        { label: 'Vehicle', cls: 'clip', render: function (x) { return esc([x.make, x.model].filter(Boolean).join(' · ')); } },
        { label: 'OE / cross ref.', cls: 'clip', render: function (x) { return esc([x.oe_numbers, x.competitor_numbers].filter(Boolean).join(' | ')); } },
        { label: 'FOB USD', num: true, render: function (x) { return money(x.fob_usd); } },
        { label: 'Landed', num: true, render: function (x) { return money(x.landed_cost); } },
        { label: 'Price GCC', num: true, render: function (x) { return money(x.price_gcc); } },
        { label: 'Status', render: function (x) { return L.pill(x.status, x.status === 'Proposed' ? 'New' : x.status); } }
      ], rows, function (x) { return L.href('stravik', ['p', x.sv_pn]); });
    } catch (e) { L.fail(e); }
  }

  function input(f, v, ed) {
    var key = f[0], kind = f[2] || '', ro = ed ? '' : ' disabled';
    if (kind === 'bool') return '<label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" data-f="' + key + '"' + (v ? ' checked' : '') + ro + ' style="width:auto"> ' + (v ? 'Yes' : 'No') + '</label>';
    if (kind.indexOf('select:') === 0) return '<select data-f="' + key + '"' + ro + '>' + kind.slice(7).split(',').map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    if (!ed) return v == null || v === '' ? '<span class="muted">–</span>' : esc(v).replace(/\n/g, '<br>');
    if (kind === 'area') return '<textarea data-f="' + key + '" rows="2">' + esc(v == null ? '' : v) + '</textarea>';
    return '<input data-f="' + key + '"' + (kind === 'num' ? ' inputmode="decimal" data-num="1"' : '') + ' value="' + esc(v == null ? '' : v) + '">';
  }
  function histTable(rows) {
    if (!rows.length) return '<p class="muted">No changes recorded yet.</p>';
    return '<div class="o-list"><table class="grid compact"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Before</th><th>After</th></tr></thead><tbody>' + rows.map(function (h) {
      return '<tr><td class="small" style="white-space:nowrap">' + esc(L.dt(h.at)) + '</td><td class="small">' + esc(h.by_email || '') + '</td><td>' + esc(h.action) + ' ' + esc(h.area.toLowerCase()) +
        (h.field ? ' <b>' + esc(L.label(h.field)) + '</b>' : '') + '</td><td class="clip"><s class="muted">' + esc(h.old_value || '') + '</s></td><td class="clip">' + esc(h.new_value || '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function form(pn) {
    try {
      var r = await Promise.all([sb.from('stravik_products').select('*').eq('sv_pn', pn).maybeSingle(), sb.from('stravik_pricing').select('*').eq('sv_pn', pn).maybeSingle(),
        sb.from('stravik_history').select('*').eq('sv_pn', pn).order('at', { ascending: false }).limit(200)]);
      var p = L.must(r[0]), pr = L.must(r[1]) || {}, hist = L.must(r[2]) || [], ed = L.isEditor();
      if (!p) { L.cp({ crumbs: [['Stravik Products', BASE], [pn]] }); return L.content(L.empty('Not found', esc(pn) + ' is not in the Stravik products.')); }
      var groups = PRODUCT_FIELDS.map(function (g) { return L.group(g[0], g[1].map(function (f) { return [f[1], input(f, p[f[0]], ed)]; })); }).join('');
      var costRows = '<tr><td>FOB (USD)</td><td class="num">' + (ed ? '<input data-p="fob_usd" data-num="1" value="' + esc(pr.fob_usd == null ? '' : pr.fob_usd) + '" style="width:110px">' : money(pr.fob_usd)) + '</td></tr>' +
        COSTS.map(function (c) { return '<tr><td>' + esc(c[1]) + '</td><td class="num">' + (ed ? '<input data-p="' + c[0] + '" data-pct="1" value="' + esc(pr[c[0]] == null ? '' : +(pr[c[0]] * 100).toFixed(4)) + '" style="width:80px"> %' : pct(pr[c[0]])) + '</td></tr>'; }).join('') +
        '<tr><td><b>Landed cost (USD)</b></td><td class="num">' + (ed ? '<input data-p="landed_cost" data-num="1" value="' + esc(pr.landed_cost == null ? '' : pr.landed_cost) + '" style="width:110px">' : '<b>' + money(pr.landed_cost) + '</b>') + '</td></tr>';
      var regRows = REGIONS.map(function (g) {
        return '<tr><td>' + esc(g[1]) + '</td><td class="num">' + (ed ? '<input data-p="margin_' + g[0] + '" data-pct="1" value="' + esc(pr['margin_' + g[0]] == null ? '' : +(pr['margin_' + g[0]] * 100).toFixed(4)) + '" style="width:70px"> %' : pct(pr['margin_' + g[0]])) +
          '</td><td class="num">' + (ed ? '<input data-p="price_' + g[0] + '" data-num="1" value="' + esc(pr['price_' + g[0]] == null ? '' : pr['price_' + g[0]]) + '" style="width:90px">' : '<b>' + money(pr['price_' + g[0]]) + '</b>') + '</td></tr>';
      }).join('');
      var pricing = '<div style="display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start"><div><h3 style="margin:0 0 6px">Cost build-up</h3><table class="grid compact"><tbody>' + costRows + '</tbody></table></div>' +
        '<div><h3 style="margin:0 0 6px">Prices by region (USD)</h3><table class="grid compact"><thead><tr><th>Region</th><th class="num">Margin</th><th class="num">Price</th></tr></thead><tbody>' + regRows + '</tbody></table></div></div>' +
        '<p class="muted small" style="margin-top:10px">' + esc(pr.price_source || '') + (pr.updated_at ? ' · last changed ' + esc(L.dt(pr.updated_at)) + (pr.updated_by ? ' by ' + esc(pr.updated_by) : '') : '') + '. Prices are internal: they are never shown on the Stravik website.</p>';
      var master = '<div class="o-groups">' + L.group('', MASTER_FIELDS.slice(0, 9).map(function (f) { return [f[1], input(f, p[f[0]], ed)]; })) + L.group('', MASTER_FIELDS.slice(9).map(function (f) { return [f[1], input(f, p[f[0]], ed)]; })) + '</div>';
      var notes = '<div class="o-groups">' + L.group('', NOTE_FIELDS.map(function (f) { return [f[1], input(f, p[f[0]], ed)]; })) + L.group('', []) + '</div>';
      L.form({
        crumbs: [['Stravik Products', BASE], [TYPE_NAME[p.category_code] || 'Filters', L.href('stravik', [], { type: p.category_code })], [p.sv_pn]],
        buttons: ed ? '<button type="button" class="btn" id="svSave">Save</button><button type="button" class="btn ghost" id="svDiscard">Discard</button>' : '',
        sheet: '<div class="o-title"><h1 class="mono">' + esc(p.sv_pn) + '</h1>' + L.pill(p.status, p.status === 'Proposed' ? 'New' : p.status) + (p.on_website ? L.pill('Website') : L.pill('Not on website', 'warn')) + '</div>' +
          '<div class="o-subtitle">' + esc(p.brand) + ' · ' + esc(p.filter_type || '') + ' · ' + esc(p.category_code) + ' sequence ' + esc(p.seq_no) + ', pack ' + esc(p.pack_variant) + '</div>' +
          '<div class="o-groups">' + groups + '</div>' +
          L.notebook([{ key: 'price', label: 'Pricing', html: pricing }, { key: 'md', label: 'Master data', html: master }, { key: 'notes', label: 'Notes', html: notes },
            { key: 'hist', label: 'History <span class="muted">(' + hist.length + ')</span>', html: histTable(hist) }])
      });
      if (!ed) return;
      $('svDiscard').onclick = function () { form(pn); };
      $('svSave').onclick = async function () {
        var btn = this;
        try {
          var up = {}, upr = {}, bad = [];
          $('content').querySelectorAll('[data-f]').forEach(function (el) {
            var k = el.dataset.f, v = el.type === 'checkbox' ? el.checked : el.value.trim();
            if (el.dataset.num) { v = L.num(v); if (Number.isNaN(v)) bad.push(L.label(k)); }
            else if (v === '') v = null;
            if (String(v) !== String(p[k] == null ? null : p[k])) up[k] = v;
          });
          $('content').querySelectorAll('[data-p]').forEach(function (el) {
            var k = el.dataset.p, v = L.num(el.value);
            if (Number.isNaN(v)) { bad.push(k); return; }
            if (v != null && el.dataset.pct) v = Math.round(v * 1e6) / 1e8;
            var cur = pr[k] == null ? null : Number(pr[k]);
            if (v !== cur && !(v != null && cur != null && Math.abs(v - cur) < 1e-9)) upr[k] = v;
          });
          if (bad.length) return L.toast('These must be numbers: ' + bad.join(', '));
          if (!Object.keys(up).length && !Object.keys(upr).length) return L.toast('Nothing changed');
          btn.disabled = true;
          if (Object.keys(up).length) L.must(await sb.from('stravik_products').update(up).eq('sv_pn', pn));
          if (Object.keys(upr).length) {
            if (pr.sv_pn) L.must(await sb.from('stravik_pricing').update(upr).eq('sv_pn', pn));
            else L.must(await sb.from('stravik_pricing').insert(Object.assign({ sv_pn: pn }, upr)));
          }
          L.toast('Saved ' + pn); form(pn);
        } catch (e) { btn.disabled = false; L.fail(e); }
      };
    } catch (e) { L.fail(e); }
  }

  async function excel() {
    try {
      L.toast('Preparing Stravik filters…');
      var rows = await L.fetchAll(function () { var q = sb.from('stravik_filters').select('*').order('sv_pn'); return S.type ? q.eq('category_code', S.type) : q; });
      var head = ['Stravik PN', 'Brand', 'Code', 'Filter type', 'Status', 'On website', 'Supplier PN', 'Supplier / manufacturer', 'Origin', 'Description', 'Product category', 'Product type', 'Subcategory',
        'Market / enquiry', 'Make', 'Model', 'Years', 'Engine / type', 'OE numbers', 'Cross references', 'Technical specifications', 'MOQ', 'FOB USD'].concat(COSTS.map(function (c) { return c[1] + ' %'; }))
        .concat(['Landed cost']).concat([].concat.apply([], REGIONS.map(function (g) { return ['Margin ' + g[1] + ' %', 'Price ' + g[1]]; }))).concat(['Price list row(s)', 'Numbering note', 'Remarks']);
      var line = function (x) {
        return [x.sv_pn, x.brand, x.category_code, x.filter_type, x.status, x.on_website ? 'Yes' : 'No', x.supplier_pn, x.manufacturer, x.origin, x.description, x.product_category, x.product_type, x.product_subcategory,
          x.enquiry, x.make, x.model, x.year_range, x.engine, x.oe_numbers, x.competitor_numbers, x.tech_specs, x.moq, num(x.fob_usd)].concat(COSTS.map(function (c) { return x[c[0]] == null ? '' : Number(x[c[0]]) * 100; }))
          .concat([num(x.landed_cost)]).concat([].concat.apply([], REGIONS.map(function (g) { return [x['margin_' + g[0]] == null ? '' : Number(x['margin_' + g[0]]) * 100, num(x['price_' + g[0]])]; })))
          .concat([x.price_list_rows, x.numbering_note, x.remarks]).map(function (v) { return v == null ? '' : v; });
      };
      var sheets = TYPES.map(function (t) { var rs = rows.filter(function (x) { return x.category_code === t[0]; }); return rs.length ? { name: t[1], head: head, rows: rs.map(line), widths: [16, 8, 6, 14, 10, 8, 20, 14, 8, 40] } : null; }).filter(Boolean);
      await L.saveXlsx(sheets, 'Stravik_filters_' + (S.type ? S.type + '_' : '') + L.today() + '.xlsx');
    } catch (e) { L.fail(e); }
  }
  function num(v) { return v == null || v === '' ? '' : Number(v); }

  var HS = { text: '', offset: 0 };
  function historyPage() {
    L.cp({ crumbs: [['Stravik Products', BASE], ['Change log']] });
    L.searchBar({ placeholder: 'Search SV no., person or value…', text: HS.text, filters: [], active: {}, onChange: function (s) { HS.text = s.text; HS.offset = 0; load(); } });
    L.content('<p class="muted small">Every change to a Stravik product or its prices is recorded here automatically: who, when, before and after.</p><div id="shList"></div>');
    async function load() {
      try {
        var q = sb.from('stravik_history').select('*', { count: 'exact' }), s = L.orSearch(['sv_pn', 'by_email', 'old_value', 'new_value', 'field'], HS.text); if (s) q = q.or(s);
        var res = await q.neq('action', 'Created').order('at', { ascending: false }).order('id', { ascending: false }).range(HS.offset, HS.offset + L.PAGE - 1), rows = L.must(res);
        L.pager(HS.offset, res.count || 0, function (o) { HS.offset = o; load(); });
        $('shList').innerHTML = !rows.length ? '<p class="muted">No changes since the filters were loaded.</p>' : '<div class="o-list"><table class="grid"><thead><tr><th>When</th><th>Stravik PN</th><th>Who</th><th>What</th><th>Before</th><th>After</th></tr></thead><tbody>' +
          rows.map(function (h) { return '<tr><td class="small" style="white-space:nowrap">' + esc(L.dt(h.at)) + '</td><td><a class="mono" href="' + L.href('stravik', ['p', h.sv_pn]) + '">' + esc(h.sv_pn) + '</a></td><td class="small">' + esc(h.by_email || '') +
            '</td><td>' + esc(h.action + ' ' + h.area.toLowerCase()) + (h.field ? ' <b>' + esc(L.label(h.field)) + '</b>' : '') + '</td><td class="clip"><s class="muted">' + esc(h.old_value || '') + '</s></td><td class="clip">' + esc(h.new_value || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      } catch (e) { L.fail(e); }
    }
    load();
  }

  L.register({
    key: 'stravik', name: 'Stravik Products', color: '#b98a45',
    icon: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    menus: [{ label: 'Filters', children: [{ label: 'All filters', href: L.href('stravik', [], { type: 'all' }) }].concat(TYPES.map(function (t) { return { label: t[1], href: L.href('stravik', [], { type: t[0] }) }; })) },
      { label: 'Change log', href: L.href('stravik', ['history']) }, { label: 'Download', action: 'xls' }],
    actions: { xls: excel },
    route: function (r) { if (r.parts[0] === 'p' && r.parts[1]) form(r.parts[1]); else if (r.parts[0] === 'history') historyPage(); else list(r); }
  });
})(window.LS);
