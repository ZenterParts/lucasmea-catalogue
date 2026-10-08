/* Lucas online catalogues — "Can't find your part?" request form.
 *
 * Put  <div data-part-request></div>  where the section should appear, then load
 *      <script src="/assets/part-request.js"></script>
 * Used on the home page, the contact page and the cart page.
 *
 * The request is emailed to info@lucasmeaparts.com through Web3Forms (same account as the cart).
 * The customer gets no email: only the on-screen confirmation with a PR- reference.
 *
 * Other scripts can fill in the form:  LucasPartRequest.prefill({ oe: '…', desc: '…' })
 * A page link can do the same:         /contact/?oe=161A0-29015
 */
(function () {
  'use strict';
  var EMAIL = 'info@lucasmeaparts.com';
  var PHONE = '+971 4 296 8166', PHONE_LINK = '+97142968166';
  var W3F_KEY = '9c667917-0eb8-4e60-b6f0-0dd8276a0b08';
  var RANGES = ['Not sure', 'Gas springs', 'Water pumps', 'Bulbs', 'Air filters', 'Oil filters', 'Fuel filters', 'Cabin filters',
    'Wiper blades', 'Horns', 'Alternators and starters', 'Tensioners and pulleys', 'Clutch kits', 'Ignition coils',
    'Spark plugs', 'Radiators', 'Batteries (Girling)', 'Brake pads (Stravik)', 'Other'];

  var CSS = [
    '.pr{background:#f2f4f3; padding:clamp(44px,6vw,88px) 0; font-family:var(--lucas-font,"League Spartan",Arial,sans-serif); color:#231F20; scroll-margin-top:12px;}',
    '.pr *{box-sizing:border-box;}',
    '.pr-in{max-width:1280px; margin:0 auto; padding:0 clamp(16px,4vw,48px); display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:clamp(24px,4vw,56px); align-items:start;}',
    '.pr h2{margin:0 0 12px; font-size:clamp(1.85rem,3.4vw,2.9rem); font-weight:600; line-height:1.05; color:#000;}',
    '.pr-lead{margin:0 0 26px; font-size:1.1rem; line-height:1.45; color:#3d3d3d;}',
    '.pr h3{margin:0 0 10px; font-size:1.1rem; font-weight:600; color:#000;}',
    '.pr-tips{list-style:none; margin:0 0 24px; padding:0; display:grid; gap:12px;}',
    '.pr-tips li{position:relative; padding-left:30px; line-height:1.4; color:#3d3d3d; font-size:1rem;}',
    '.pr-tips li::before{content:""; position:absolute; left:0; top:3px; width:18px; height:18px; border-radius:50%; background:#007a3e url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27white%27 stroke-width=%273.2%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M5 12l5 5 9-10%27/%3E%3C/svg%3E") center/12px no-repeat;}',
    '.pr-tips b{color:#000;}',
    '.pr-alt{margin:0; font-size:1rem; color:#3d3d3d;}',
    '.pr-alt a{color:#007a3e; font-weight:600;}',
    '.pr-card{background:#fff; border-top:4px solid #00954C; box-shadow:0 1px 0 #dfe3e1;}',
    '.pr-form{display:block; margin:0; padding:clamp(18px,2.4vw,30px);}',
    '.pr fieldset{border:0; margin:0 0 20px; padding:0; min-width:0;}',
    '.pr legend{padding:0; margin:0 0 10px; font-weight:700; font-size:1.05rem; color:#000;}',
    '.pr legend .opt, .pr label .opt{font-weight:400; color:#6d6e71;}',
    '.pr-grid{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 14px;}',
    '.pr-grid.four{grid-template-columns:repeat(4,minmax(0,1fr));}',
    '.pr-grid .full{grid-column:1 / -1;}',
    '.pr label{display:block; margin:0 0 5px; font-weight:600; font-size:.9rem; color:#231F20;}',
    '.pr input, .pr select, .pr textarea{display:block; width:100%; margin:0; padding:10px 12px 8px; border:1px solid #c9c9c9; border-radius:4px; background:#fff; color:#231F20; font:inherit; font-size:1rem; line-height:1.3;}',
    '.pr textarea{min-height:92px; resize:vertical;}',
    '.pr input:focus-visible, .pr select:focus-visible, .pr textarea:focus-visible, .pr button:focus-visible{outline:3px solid #231F20; outline-offset:2px;}',
    '.pr .bad{border-color:#b3261e; background:#fdf3f2;}',
    '.pr-err{display:none; margin:4px 0 0; color:#b3261e; font-size:.85rem;}',
    '.pr .bad + .pr-err{display:block;}',
    '.pr-need{display:none; margin:-8px 0 16px; padding:10px 12px; border-radius:4px; background:#fdf3f2; color:#8c1d18; font-size:.9rem;}',
    '.pr-need.show{display:block;}',
    '.pr-hint{margin:0 0 12px; font-size:.9rem; color:#6d6e71;}',
    '.pr-btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; border:0; border-radius:4px; background:#00954C; color:#fff; font:inherit; font-weight:600; font-size:1.05rem; padding:13px 26px 11px; cursor:pointer; text-decoration:none;}',
    '.pr-btn:hover{background:#007a3e;}',
    '.pr-btn:disabled{opacity:.6; cursor:progress;}',
    '.pr-btn.ghost{background:#fff; color:#007a3e; border:2px solid #007a3e; padding:11px 22px 9px;}',
    '.pr-note{margin:12px 0 0; font-size:.85rem; color:#6d6e71;}',
    '.pr-status{display:none; margin:14px 0 0; padding:12px 14px; border-radius:4px; background:#fdf3f2; color:#8c1d18; border:1px solid #f2c7c3; font-size:.95rem;}',
    '.pr-status.show{display:block;}',
    '.pr-status a{color:#8c1d18; font-weight:700;}',
    '.pr-done{padding:clamp(24px,3vw,40px); text-align:center;}',
    '.pr-done .tick{width:60px; height:60px; border-radius:50%; background:#00954C; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;}',
    '.pr-done h3{font-size:1.6rem; margin:0 0 8px; color:#00954C;}',
    '.pr-done p{margin:0 auto 10px; max-width:460px; color:#3d3d3d;}',
    '.pr-ref{display:inline-flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:center; margin:12px 0 14px; padding:12px 16px 10px; border:1px dashed #00954C; border-radius:6px; background:#e6f4ed;}',
    '.pr-ref span{font-size:.8rem; text-transform:uppercase; letter-spacing:.05em; color:#6d6e71;}',
    '.pr-ref strong{font-size:1.4rem; letter-spacing:.04em; color:#231F20;}',
    '.pr-ref button{font:inherit; font-size:.85rem; background:#fff; border:1px solid #00954C; color:#007a3e; border-radius:4px; padding:5px 10px 3px; cursor:pointer;}',
    '.pr-acts{display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:10px;}',
    '@media (max-width:900px){ .pr-in{grid-template-columns:1fr;} .pr-grid.four{grid-template-columns:repeat(2,minmax(0,1fr));} }',
    '@media (max-width:520px){ .pr-grid{grid-template-columns:1fr;} .pr-grid.four{grid-template-columns:repeat(2,minmax(0,1fr));} }'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function field(id, label, opts) {
    opts = opts || {};
    var opt = opts.optional ? ' <span class="opt">(optional)</span>' : '';
    var attrs = (opts.required ? ' required' : '') + (opts.auto ? ' autocomplete="' + opts.auto + '"' : '') + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.mode ? ' inputmode="' + opts.mode + '"' : '');
    var input = opts.textarea ? '<textarea id="' + id + '"' + attrs + '></textarea>'
      : opts.select ? '<select id="' + id + '">' + opts.select.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'
      : '<input type="' + (opts.type || 'text') + '" id="' + id + '"' + attrs + '>';
    return '<div' + (opts.full ? ' class="full"' : '') + '><label for="' + id + '">' + label + opt + '</label>' + input +
      (opts.err ? '<p class="pr-err">' + opts.err + '</p>' : '') + '</div>';
  }

  var html =
    '<section class="pr" id="find-part" aria-labelledby="pr-title"><div class="pr-in">' +
      '<div class="pr-intro">' +
        '<h2 id="pr-title">Can\'t find your part?</h2>' +
        '<p class="pr-lead">Tell us what you\'re looking for and our team will find the Lucas match and get back to you. The more you can tell us, the faster we can help.</p>' +
        '<h3>What helps us find it fastest</h3>' +
        '<ul class="pr-tips">' +
          '<li><b>OE number:</b> the vehicle maker\'s part number, often printed on the old part or its label.</li>' +
          '<li><b>Another brand\'s number:</b> for example Bosch, MANN, Denso or NGK, from the part you have now.</li>' +
          '<li><b>Vehicle details:</b> make, model, year and engine, or the VIN / chassis number.</li>' +
          '<li><b>A photo</b> of the part or its label: reply to our email with it, or send it on WhatsApp.</li>' +
        '</ul>' +
        '<p class="pr-alt">Prefer to talk? Call <a href="tel:' + PHONE_LINK + '">' + PHONE + '</a> or email <a href="mailto:' + EMAIL + '">' + EMAIL + '</a>.</p>' +
      '</div>' +
      '<div class="pr-card">' +
        '<form class="pr-form" id="pr-form" novalidate>' +
          '<fieldset><legend>The part</legend>' +
            '<p class="pr-hint">Give us at least one of: OE number, another brand\'s number, or the vehicle make.</p>' +
            '<div class="pr-grid">' +
              field('pr-oe', 'OE number', { ph: 'e.g. 16546-HA00B' }) +
              field('pr-xref', 'Other brand and number', { ph: 'e.g. MANN W 712/75' }) +
              field('pr-desc', 'What part is it?', { full: true, required: true, ph: 'e.g. Air filter, front brake pads, alternator 12V 90A', err: 'Describe the part you need.' }) +
              field('pr-range', 'Product range', { select: RANGES }) +
              field('pr-qty', 'Quantity', { optional: true, mode: 'numeric', ph: 'e.g. 50' }) +
            '</div>' +
          '</fieldset>' +
          '<div class="pr-need" id="pr-need" role="alert">Add an OE number, another brand\'s number, or the vehicle make, so we can identify the part.</div>' +
          '<fieldset><legend>Vehicle <span class="opt">(if you know it)</span></legend>' +
            '<div class="pr-grid four">' +
              field('pr-make', 'Make', { ph: 'e.g. Toyota' }) +
              field('pr-model', 'Model', { ph: 'e.g. Hilux' }) +
              field('pr-year', 'Year', { mode: 'numeric', ph: 'e.g. 2018' }) +
              field('pr-engine', 'Engine', { ph: 'e.g. 2.4 D-4D' }) +
            '</div>' +
            '<div class="pr-grid" style="margin-top:12px">' + field('pr-vin', 'VIN / chassis number', { full: true, optional: true }) + '</div>' +
          '</fieldset>' +
          '<fieldset><legend>Your details</legend>' +
            '<div class="pr-grid">' +
              field('pr-name', 'Full name', { required: true, auto: 'name', err: 'Enter your name.' }) +
              field('pr-company', 'Company', { optional: true, auto: 'organization' }) +
              field('pr-email', 'Email', { type: 'email', required: true, auto: 'email', err: 'Enter an email address like name@company.com.' }) +
              field('pr-phone', 'Phone / WhatsApp', { type: 'tel', required: true, auto: 'tel', ph: '+971 50 123 4567', err: 'Enter a phone number.' }) +
              field('pr-country', 'Country', { required: true, auto: 'country-name', err: 'Enter your country.' }) +
              field('pr-type', 'I am a', { select: ['Distributor', 'Parts store', 'Workshop', 'Fleet operator', 'Other'] }) +
            '</div>' +
          '</fieldset>' +
          '<fieldset style="margin-bottom:16px"><div class="pr-grid">' +
            field('pr-more', 'Anything else that helps', { full: true, optional: true, textarea: true, ph: 'Measurements, position (front / rear, left / right), condition of the old part, delivery location…' }) +
          '</div></fieldset>' +
          '<input type="checkbox" id="pr-botcheck" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true">' +
          '<button class="pr-btn" type="submit" id="pr-send">Send part request</button>' +
          '<p class="pr-note">By sending, you agree that we can contact you about this request.</p>' +
          '<div class="pr-status" id="pr-status" role="alert"></div>' +
        '</form>' +
        '<div class="pr-done" id="pr-done" hidden></div>' +
      '</div>' +
    '</div></section>';

  function $(id) { return document.getElementById(id); }
  function v(id) { return ($(id) && $(id).value || '').trim(); }
  function newRef() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = '';
    for (var i = 0; i < 4; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'PR-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + r;
  }

  function mount() {
    var host = document.querySelector('[data-part-request]');
    if (!host || host.__pr) return;
    host.__pr = true;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    host.outerHTML = html;

    var form = $('pr-form'), btn = $('pr-send'), status = $('pr-status'), need = $('pr-need'), done = $('pr-done');
    var IDS_REQ = ['pr-desc', 'pr-name', 'pr-email', 'pr-phone', 'pr-country'];

    function check() {
      var first = null;
      IDS_REQ.forEach(function (id) {
        var el = $(id), val = v(id), ok = !!val;
        if (id === 'pr-email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        el.classList.toggle('bad', !ok); el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !first) first = el;
      });
      var hasId = !!(v('pr-oe') || v('pr-xref') || v('pr-make'));
      need.classList.toggle('show', !hasId);
      ['pr-oe', 'pr-xref', 'pr-make'].forEach(function (id) { $(id).classList.toggle('bad', !hasId); });
      if (!hasId && !first) first = $('pr-oe');
      return first;
    }
    form.addEventListener('input', function (e) {
      if (e.target.classList.contains('bad')) {
        if (['pr-oe', 'pr-xref', 'pr-make'].indexOf(e.target.id) > -1) { if (v('pr-oe') || v('pr-xref') || v('pr-make')) { need.classList.remove('show'); ['pr-oe', 'pr-xref', 'pr-make'].forEach(function (id) { $(id).classList.remove('bad'); }); } }
        else if (e.target.value.trim()) e.target.classList.remove('bad');
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.classList.remove('show');
      var bad = check();
      if (bad) { bad.focus(); return; }
      var ref = newRef();
      var who = v('pr-company') || v('pr-name');
      var what = v('pr-oe') ? 'OE ' + v('pr-oe') : (v('pr-xref') || v('pr-desc'));
      var subject = 'Part request ' + ref + ' | ' + what + ' | ' + who;
      var vehicle = [v('pr-make'), v('pr-model'), v('pr-year'), v('pr-engine')].filter(Boolean).join(' ');
      var data = {
        access_key: W3F_KEY, subject: subject, from_name: 'Lucas online catalogue', replyto: v('pr-email'),
        botcheck: $('pr-botcheck').checked,
        'Request type': 'Part search (customer could not find the part)',
        'Reference': ref,
        'Part description': v('pr-desc'),
        'OE number': v('pr-oe') || '-',
        'Other brand and number': v('pr-xref') || '-',
        'Product range': v('pr-range'),
        'Quantity': v('pr-qty') || '-',
        'Vehicle': vehicle || '-',
        'VIN / chassis number': v('pr-vin') || '-',
        'Anything else': v('pr-more') || '-',
        name: v('pr-name'), company: v('pr-company') || '-', email: v('pr-email'), phone: v('pr-phone'),
        country: v('pr-country'), customer_type: v('pr-type'),
        'Sent from': location.href
      };
      var bodyText = 'Reference: ' + ref + '\nPart: ' + data['Part description'] + '\nOE number: ' + data['OE number'] +
        '\nOther brand and number: ' + data['Other brand and number'] + '\nProduct range: ' + data['Product range'] + '\nQuantity: ' + data['Quantity'] +
        '\nVehicle: ' + data['Vehicle'] + '\nVIN / chassis: ' + data['VIN / chassis number'] + '\nAnything else: ' + data['Anything else'] +
        '\n\nName: ' + data.name + '\nCompany: ' + data.company + '\nEmail: ' + data.email + '\nPhone: ' + data.phone + '\nCountry: ' + data.country + '\nI am a: ' + data.customer_type;
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.success) throw new Error(j.message || ('Status ' + r.status)); });
      }).then(function () {
        showDone(ref, v('pr-name'), v('pr-email'));
      }).catch(function (err) {
        var href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyText);
        status.innerHTML = '<b>Your request wasn\'t sent.</b> Check your connection and try again, or <a href="' + href + '">email it to ' + EMAIL + '</a> instead.<br><small>Details: ' + esc(err.message || 'unknown error') + '</small>';
        status.classList.add('show');
      }).then(function () { btn.disabled = false; btn.textContent = 'Send part request'; });
    });

    function showDone(ref, name, email) {
      form.hidden = true;
      done.innerHTML =
        '<div class="tick"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></div>' +
        '<h3 tabindex="-1" id="pr-done-title">Thank you' + (name ? ', ' + esc(name.split(' ')[0]) : '') + '</h3>' +
        '<p>We\'ve received your part request. Our team will look for the Lucas match and contact you at <b>' + esc(email) + '</b>.</p>' +
        '<div class="pr-ref"><span>Your reference</span><strong>' + esc(ref) + '</strong><button type="button" id="pr-copy">Copy</button></div>' +
        '<p>Have a photo of the part or its label? Reply to our email with it, or send it on WhatsApp quoting this reference.</p>' +
        '<div class="pr-acts"><button type="button" class="pr-btn ghost" id="pr-again">Send another request</button><a class="pr-btn" href="/#catalogues">Browse the catalogues</a></div>';
      done.hidden = false;
      $('pr-done-title').focus();
      $('pr-copy').addEventListener('click', function () {
        var b = this; (navigator.clipboard ? navigator.clipboard.writeText(ref) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { window.prompt('Copy this reference:', ref); });
      });
      $('pr-again').addEventListener('click', function () {
        ['pr-oe', 'pr-xref', 'pr-desc', 'pr-qty', 'pr-make', 'pr-model', 'pr-year', 'pr-engine', 'pr-vin', 'pr-more'].forEach(function (id) { $(id).value = ''; });
        $('pr-range').selectedIndex = 0;
        done.hidden = true; form.hidden = false; $('pr-oe').focus();
      });
    }

    // fill in from a link such as /contact/?oe=16546-HA00B
    try {
      var qs = new URLSearchParams(location.search), oe = qs.get('oe') || qs.get('part');
      if (oe) { $('pr-oe').value = oe; }
    } catch (e) {}
    if (location.hash === '#find-part') setTimeout(function () { var s = $('find-part'); if (s) s.scrollIntoView(); }, 0);
  }

  window.LucasPartRequest = {
    prefill: function (o) {
      mount(); o = o || {};
      if (o.oe != null && $('pr-oe')) $('pr-oe').value = o.oe;
      if (o.desc != null && $('pr-desc')) $('pr-desc').value = o.desc;
      var s = $('find-part'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var f = $('pr-desc'); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 400);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
