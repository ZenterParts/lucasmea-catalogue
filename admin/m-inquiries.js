/* Module 1: Inquiries (website requests and customers' lists), priced at FOB, with stock */
(function (L) {
  'use strict';
  var $ = L.$, esc = L.esc, sb = L.sb, st = { page: 0 };

  async function load(page) {
    if (page != null) st.page = page;
    try {
      var q = sb.from('inquiry_summary').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(st.page * L.PAGE, st.page * L.PAGE + L.PAGE - 1);
      if ($('iqStatus').value) q = q.eq('status', $('iqStatus').value);
      if ($('iqSource').value) q = q.eq('source', $('iqSource').value);
      var s = L.orSearch(['ref', 'company', 'name', 'email'], $('iqSearch').value); if (s) q = q.or(s);
      var res = await q, rows = L.must(res), t = $('iqTable');
      if (!rows.length) { t.innerHTML = '<tbody><tr><td class="empty">No inquiries yet. Website requests appear here automatically' + (L.isEditor() ? '; customers\' lists can be added with "New inquiry from a list".' : '.') + '</td></tr></tbody>'; $('iqPager').innerHTML = ''; return; }
      t.innerHTML = '<thead><tr><th>Received</th><th>Inquiry no.</th><th>Source</th><th>Company</th><th>Name</th><th>Country</th><th class="num">Lines</th><th class="num">Pieces</th><th class="num">Total FOB USD</th><th>Needs attention</th><th>Status</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var att = [];
          if (r.not_found) att.push(r.not_found + ' not found');
          if (r.lines_flagged - r.not_found > 0) att.push((r.lines_flagged - r.not_found) + ' other');
          return '<tr class="click" data-ref="' + esc(r.ref) + '"><td>' + esc(L.dt(r.created_at)) + '</td><td class="pn">' + esc(r.ref) + '</td><td>' + esc(r.source) + '</td><td>' + esc(r.company) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.country) +
            '</td><td class="num">' + L.qty(r.lines) + '</td><td class="num">' + L.qty(r.pieces) + '</td><td class="num">' + L.money(r.total_fob_usd) + '</td><td>' + (att.length ? '<span class="flag">' + att.join(', ') + '</span>' : '') +
            '</td><td><span class="pill ' + esc(r.status) + '">' + esc(r.status) + '</span></td></tr>';
        }).join('') + '</tbody>';
      L.pager($('iqPager'), st.page, res.count || rows.length, load);
    } catch (e) { L.fail(e); }
  }

  // ---------- one inquiry ----------
  async function open(ref, filter) {
    try {
      var h = L.must(await sb.from('inquiries').select('*').eq('ref', ref).single());
      var lines = await L.fetchAll(function () { return sb.from('inquiry_lines').select('*').eq('ref', ref).order('line'); });
      var total = 0, pcs = 0, cnt = { all: lines.length, att: 0, nf: 0, sev: 0, np: 0 };
      lines.forEach(function (l) {
        total += Number(l.line_fob_usd) || 0; pcs += l.qty;
        if (l.flag) cnt.att++; if (l.flag === 'Not found') cnt.nf++; if (/^Several/.test(l.flag || '')) cnt.sev++; if (l.flag === 'No FOB price') cnt.np++;
      });
      filter = filter || 'all';
      var shown = lines.filter(function (l) {
        return filter === 'all' || (filter === 'att' && l.flag) || (filter === 'nf' && l.flag === 'Not found') || (filter === 'sev' && /^Several/.test(l.flag || '')) || (filter === 'np' && l.flag === 'No FOB price') || (filter === 'ok' && !l.flag);
      });
      var stt = ['New', 'Quoted', 'Won', 'Lost', 'Closed'], ed = L.isEditor();
      var MAX = 1500;
      L.drawer('<h1>' + esc(h.ref) + ' <span class="pill ' + esc(h.status) + '">' + esc(h.status) + '</span></h1>' +
        '<p class="muted">' + esc(h.source) + ' · received ' + esc(L.dt(h.created_at)) + (h.created_by ? ' · added by ' + esc(h.created_by) : '') + '</p>' +
        '<div class="dl">' + [['Name', esc(h.name)], ['Company', esc(h.company)], ['Email', h.email ? '<a href="mailto:' + esc(h.email) + '">' + esc(h.email) + '</a>' : ''], ['Phone', esc(h.phone)], ['Country', esc(h.country)], ['Customer type', esc(h.customer_type)]]
          .map(function (p) { return '<div><b>' + p[0] + '</b>' + (p[1] || '&nbsp;') + '</div>'; }).join('') + '</div>' +
        (h.message ? '<h3>Message</h3><p style="white-space:pre-wrap">' + esc(h.message) + '</p>' : '') +
        '<h3>Parts: ' + L.qty(lines.length) + ' lines, ' + L.qty(pcs) + ' pcs, FOB total USD ' + L.money(total) + '</h3>' +
        '<div class="chips" id="dFilter">' +
          L.chip('All ' + cnt.all, filter === 'all' ? 'on' : '', 'all') + L.chip('Priced ' + (cnt.all - cnt.att), filter === 'ok' ? 'on' : '', 'ok') +
          (cnt.att ? L.chip('Needs attention ' + cnt.att, 'warn' + (filter === 'att' ? ' on' : ''), 'att') : '') +
          (cnt.nf ? L.chip('Not found ' + cnt.nf, 'warn' + (filter === 'nf' ? ' on' : ''), 'nf') : '') +
          (cnt.sev ? L.chip('Several matches ' + cnt.sev, 'warn' + (filter === 'sev' ? ' on' : ''), 'sev') : '') +
          (cnt.np ? L.chip('No FOB price ' + cnt.np, 'warn' + (filter === 'np' ? ' on' : ''), 'np') : '') + '</div>' +
        '<div class="tablewrap" style="max-height:52vh"><table class="grid" id="dLines"><thead><tr><th>#</th><th>Requested</th><th>Matched as</th><th>Lucas PN</th><th>Description</th><th>Range</th><th class="num">Qty</th><th class="num">FOB USD</th><th class="num">Line FOB USD</th><th class="num">Available</th><th>Note</th></tr></thead><tbody>' +
        shown.slice(0, MAX).map(function (l) {
          var pnCell = esc(l.lucas_pn || '');
          if (ed && l.candidates && l.candidates.length) {
            pnCell = '<select data-item="' + l.item_id + '"><option value="">Choose…</option>' + l.candidates.map(function (c) { return '<option' + (c === l.lucas_pn ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>';
          } else if (ed && !l.lucas_pn) {
            pnCell = '<input class="pnfix" data-item="' + l.item_id + '" placeholder="Lucas PN" size="10">';
          } else if (!l.lucas_pn && l.candidates) pnCell = '<span class="muted">' + esc(l.candidates.join(', ')) + '</span>';
          return '<tr><td>' + l.line + '</td><td>' + esc(l.requested_pn) + '</td><td class="clip small">' + esc(l.matched_via || '') + '</td><td class="pn">' + pnCell + '</td><td class="clip">' + esc(l.description) + '</td><td>' + esc(l.subcategory || '') +
            '</td><td class="num">' + L.qty(l.qty) + '</td><td class="num">' + L.money(l.fob_usd) + '</td><td class="num">' + L.money(l.line_fob_usd) + '</td><td class="num">' + L.qty(l.available) + '</td><td>' + (l.flag ? '<span class="flag">' + esc(l.flag) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (shown.length > MAX ? '<p class="muted small">Showing the first ' + MAX + ' of ' + shown.length + ' lines. The Excel download has all of them.</p>' : '') +
        '<div class="editor-only"><h3>Follow-up</h3><div class="form2"><label>Status<select id="dStatus">' + stt.map(function (s) { return '<option' + (s === h.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label></div>' +
        '<label>Notes for the team<textarea id="dNotes">' + esc(h.staff_notes || '') + '</textarea></label></div>' +
        (!ed && h.staff_notes ? '<h3>Notes</h3><p style="white-space:pre-wrap">' + esc(h.staff_notes) + '</p>' : '') +
        '<div class="actions"><button class="btn editor-only" id="dSave">Save</button><button class="btn ghost" id="dXls">Download Excel with prices</button></div>');

      $('dFilter').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) open(ref, b.dataset.f); };
      $('dXls').onclick = function () { excel(h, lines, total, pcs).catch(L.fail); };
      if (!ed) return;
      $('dLines').addEventListener('change', async function (e) {
        var s = e.target.closest('select[data-item], input.pnfix'); if (!s) return;
        var pn = L.clean(s.value) || null;
        try { L.must(await sb.rpc('choose_inquiry_match', { item_id: Number(s.dataset.item), pn: pn })); L.toast(pn ? 'Line set to ' + pn : 'Line cleared'); open(ref, filter); load(); }
        catch (err) { L.fail(err); }
      });
      $('dSave').onclick = async function () {
        try { L.must(await sb.from('inquiries').update({ status: $('dStatus').value, staff_notes: $('dNotes').value }).eq('ref', h.ref)); L.toast('Saved'); load(); open(h.ref, filter); } catch (e) { L.fail(e); }
      };
    } catch (e) { L.fail(e); }
  }

  function excel(h, lines, total, pcs) {
    var head = ['#', 'Requested', 'Matched as', 'Lucas PN', 'Description', 'Range', 'Qty', 'FOB USD', 'Line FOB USD', 'Available', 'Note', 'Other possible parts'];
    var row = function (l) { return [l.line, l.requested_pn, l.matched_via || '', l.lucas_pn || '', l.description || '', l.subcategory || '', l.qty, l.fob_usd == null ? '' : Number(l.fob_usd), l.line_fob_usd == null ? '' : Number(l.line_fob_usd), l.available == null ? '' : Number(l.available), l.flag || '', (l.candidates || []).join(', ')]; };
    var top = [['Inquiry ' + h.ref], ['Source', h.source || ''], ['Received', L.dt(h.created_at)], ['Company', h.company || ''], ['Name', h.name || ''], ['Email', h.email || ''], ['Phone', h.phone || ''], ['Country', h.country || ''], []];
    var sheets = [{ name: 'Inquiry', widths: [6, 18, 30, 12, 50, 14, 8, 10, 12, 10, 24, 30], top: top, head: head, rows: lines.map(row), foot: [['', '', '', '', 'Total (priced lines)', '', pcs, '', Math.round(total * 100) / 100]] }];
    var att = lines.filter(function (l) { return l.flag; });
    if (att.length) sheets.push({ name: 'Needs attention', widths: [6, 18, 30, 12, 50, 14, 8, 10, 12, 10, 24, 30], head: head, rows: att.map(row) });
    return L.saveXlsx(sheets, h.ref + '_FOB.xlsx');
  }

  // ---------- new inquiry from a customer's list (data team) ----------
  // prefill: optional [{no, qty, desc}] coming from the Number lookup module
  function newInquiry(prefill) {
    var items = prefill || null;
    L.drawer('<h1>New inquiry from a list</h1><p class="muted">For customers who send a list of OE, competitor or Lucas numbers. Every number is matched to a Lucas part, priced at FOB, and flagged if it isn\'t found.</p>' +
      '<h3>Customer</h3><div class="form2">' + [['nCompany', 'Company'], ['nName', 'Contact name'], ['nEmail', 'Email'], ['nPhone', 'Phone'], ['nCountry', 'Country']].map(function (f) { return '<label>' + f[1] + '<input id="' + f[0] + '"></label>'; }).join('') +
      '<label>Customer type<select id="nType"><option></option><option>Distributor</option><option>Retailer</option><option>Workshop / garage</option><option>Fleet</option><option>Other</option></select></label>' +
      '<label>Received by<select id="nSource"><option>Email / list</option><option>WhatsApp</option><option>Phone</option><option>Visit</option></select></label></div>' +
      '<label>Notes / customer message<textarea id="nMsg"></textarea></label>' +
      '<h3>Parts list</h3>' +
      (items ? '<p id="nListInfo"><b>' + items.length + '</b> numbers taken from Number lookup.</p>' :
        '<div class="cols2"><div><label>Paste numbers (one per line, quantity after a tab or semicolon)<textarea id="nPaste" rows="7" placeholder="04C121004E; 10&#10;W 67/1; 50"></textarea></label></div>' +
        '<div><label>Or upload Excel / CSV<input type="file" id="nFile" accept=".xlsx,.csv"></label><p class="muted small" id="nListInfo"></p></div></div>') +
      '<div class="actions"><button class="btn ghost" id="nCheck">Check list</button><button class="btn" id="nCreate" disabled>Create inquiry</button></div><div id="nPreview"></div>');
    function current() {
      if (items) return items;
      return L.parseListText($('nPaste').value);
    }
    if (!items) {
      $('nFile').onchange = async function () {
        var f = this.files[0]; if (!f) return;
        try { var r = await L.parseListFile(f); $('nPaste').value = r.items.map(function (i) { return i.no + '; ' + i.qty; }).join('\n'); $('nListInfo').textContent = r.info; $('nCreate').disabled = true; }
        catch (e) { L.fail(e); }
      };
      $('nPaste').oninput = function () { $('nCreate').disabled = true; };
    }
    $('nCheck').onclick = async function () {
      var list = current(); if (!list.length) return L.toast('The list is empty');
      if (list.length > 10000) return L.toast('Up to 10,000 lines per inquiry');
      var btn = this; btn.disabled = true;
      try {
        var res = await L.lookupNumbers(list.map(function (i) { return i.no; }), function (d, t) { btn.textContent = 'Checking ' + d + ' / ' + t; });
        var seen = {}, c = { Found: 0, 'Several matches': 0, 'Not found': 0 };
        res.forEach(function (r) { if (!seen[r.ord]) { seen[r.ord] = 1; c[r.result]++; } });
        $('nPreview').innerHTML = '<p><b>' + list.length + '</b> lines: <span class="ok">' + c.Found + ' found</span>, ' + c['Several matches'] + ' with several possible parts (choose after creating), <span class="flag">' + c['Not found'] + ' not found</span>.</p>';
        $('nCreate').disabled = false;
      } catch (e) { L.fail(e); }
      btn.disabled = false; btn.textContent = 'Check list';
    };
    $('nCreate').onclick = async function () {
      var list = current(); if (!list.length) return;
      var btn = this; btn.disabled = true; btn.textContent = 'Creating…';
      try {
        var ref = L.must(await sb.rpc('create_inquiry', {
          header: { company: $('nCompany').value, name: $('nName').value, email: $('nEmail').value, phone: $('nPhone').value, country: $('nCountry').value, type: $('nType').value, message: $('nMsg').value, source: $('nSource').value },
          lines: list.map(function (i) { return { no: i.no, qty: i.qty || 1, desc: i.desc || '' }; })
        }));
        L.toast('Inquiry ' + ref + ' created'); L.openTab('inquiries'); load(0); open(ref);
      } catch (e) { L.fail(e); btn.disabled = false; btn.textContent = 'Create inquiry'; }
    };
  }

  L.modules.inquiries = {
    init: function () {
      var reload = L.debounce(function () { load(0); });
      $('iqSearch').addEventListener('input', reload);
      $('iqStatus').addEventListener('change', function () { load(0); });
      $('iqSource').addEventListener('change', function () { load(0); });
      $('iqReload').addEventListener('click', function () { load(); });
      $('iqNew').addEventListener('click', function () { newInquiry(); });
      $('iqTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-ref]'); if (tr) open(tr.dataset.ref); });
      load(0);
    },
    show: function () { load(); }
  };
  L.newInquiry = newInquiry;
})(window.LS);
