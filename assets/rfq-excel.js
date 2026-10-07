/* Lucas online catalogues — builds the inquiry Excel file in the browser.
 * Same layout for every catalogue: Inquiry No., LP No., Description, Qty (no technical data).
 * Loads ExcelJS (self-hosted) only when needed.
 *   LucasRFQExcel.build(request) -> Promise<Blob>
 *   request = { ref, date (Date), name, company, email, phone, country, type, message, items: [cart items] }
 */
(function () {
  'use strict';
  var BASE = (function () { var s = document.currentScript; return s ? s.src.replace(/[^/]*$/, '') : '/assets/'; })();
  var GREEN = 'FF00954C', GREEN_10 = 'FFE6F4ED', GREY = 'FFEDEDED', BLACK = 'FF231F20', MUTED = 'FF6D6E71';
  var FONT = 'Arial';

  var libPromise = null;
  function loadLib() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!libPromise) {
      libPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = BASE + 'vendor-exceljs.min.js';
        s.onload = function () { window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Excel library did not load')); };
        s.onerror = function () { libPromise = null; reject(new Error('Excel library did not load')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }
  function loadLogo() {
    return fetch(BASE + 'lucas-logo.png').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(function (buf) {
        var b = new Uint8Array(buf), s = '';
        for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        return btoa(s);
      }).catch(function () { return null; });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function descOf(it) {
    if (it.desc) return String(it.desc);
    if (window.LucasCart && LucasCart.describe) return LucasCart.describe(it);
    return [it.make, it.app].filter(Boolean).join(' ');
  }

  // Same four columns for every catalogue: Inquiry No. | LP No. | Description | Qty
  function build(req) {
    return Promise.all([loadLib(), loadLogo()]).then(function (res) {
      var ExcelJS = res[0], logo = res[1];
      var items = req.items || [];
      var date = req.date || new Date();
      var cols = [{ h: 'Inquiry No.', w: 22 }, { h: 'LP No.', w: 16 }, { h: 'Description', w: 64 }, { h: 'Qty', w: 9 }];
      var N = cols.length;

      var wb = new ExcelJS.Workbook();
      wb.creator = 'Lucas online catalogue'; wb.created = date;
      var ws = wb.addWorksheet('Inquiry', {
        views: [{ showGridLines: false }],
        pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
        headerFooter: { oddFooter: '&L' + (req.ref || '') + '&RPage &P of &N' }
      });
      ws.columns = cols.map(function (c) { return { width: c.w }; });

      var thin = { style: 'thin', color: { argb: 'FFD0D0D0' } };
      var box = { top: thin, left: thin, bottom: thin, right: thin };
      function fill(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }

      // Row 1: green brand bar with logo
      ws.getRow(1).height = 42;
      for (var c = 1; c <= N; c++) ws.getCell(1, c).fill = fill(GREEN);
      if (logo) {
        var id = wb.addImage({ base64: logo, extension: 'png' });
        ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 208, height: 42 }, editAs: 'absolute' });
      }
      ws.mergeCells(1, 3, 1, N);
      var t = ws.getCell(1, 3);
      t.value = 'INQUIRY ' + (req.ref || ''); t.font = { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      t.alignment = { horizontal: 'right', vertical: 'middle' };

      // Inquiry and customer details
      var info = [
        ['Inquiry No.', req.ref], ['Date', fmtDate(date)], ['Name', req.name], ['Company', req.company],
        ['Email', req.email], ['Phone / WhatsApp', req.phone], ['Country', req.country], ['Customer type', req.type],
        ['Message', req.message]
      ];
      var r = 3;
      info.forEach(function (row) {
        ws.mergeCells(r, 2, r, N);
        var a = ws.getCell(r, 1), b = ws.getCell(r, 2);
        a.value = row[0]; a.font = { name: FONT, size: 10, bold: true, color: { argb: MUTED } }; a.fill = fill(GREY);
        a.alignment = { vertical: 'top' }; a.border = box;
        b.value = row[1] || '–'; b.font = { name: FONT, size: 10, bold: row[0] === 'Inquiry No.', color: { argb: BLACK } };
        b.alignment = { vertical: 'top', wrapText: true }; b.border = box;
        if (row[0] === 'Email' && row[1]) { b.value = { text: row[1], hyperlink: 'mailto:' + row[1] }; b.font = { name: FONT, size: 10, color: { argb: GREEN }, underline: true }; }
        if (row[0] === 'Message' && row[1] && row[1].length > 80) ws.getRow(r).height = Math.min(90, 15 * Math.ceil(row[1].length / 80));
        r++;
      });

      // Parts table
      r += 1;
      var sec = ws.getCell(r, 1); ws.mergeCells(r, 1, r, N);
      sec.value = 'Parts requested (' + items.length + ' line' + (items.length === 1 ? '' : 's') + ')';
      sec.font = { name: FONT, size: 12, bold: true, color: { argb: GREEN } };
      r += 1;
      var headRow = r, hr = ws.getRow(r); hr.height = 22;
      cols.forEach(function (col, i) {
        var cell = hr.getCell(i + 1);
        cell.value = col.h;
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = fill(GREEN); cell.border = box;
        cell.alignment = { vertical: 'middle', horizontal: i === N - 1 ? 'center' : 'left' };
      });
      r++;
      var first = r;
      items.forEach(function (it, idx) {
        var row = ws.getRow(r);
        [req.ref || '', it.no, descOf(it), Number(it.qty) || 1].forEach(function (v, i) {
          var cell = row.getCell(i + 1);
          cell.value = v; cell.border = box;
          cell.font = { name: FONT, size: 10, color: { argb: i === 1 ? GREEN : BLACK }, bold: i === 1 };
          cell.alignment = { vertical: 'top', wrapText: true, horizontal: i === N - 1 ? 'center' : 'left' };
          if (idx % 2 === 1) cell.fill = fill('FFF7F7F7');
        });
        r++;
      });
      var last = r - 1;

      // Total quantity
      var tr = ws.getRow(r); tr.height = 20;
      ws.mergeCells(r, 1, r, N - 1);
      var tl = tr.getCell(1); tl.value = 'Total quantity'; tl.alignment = { horizontal: 'right', vertical: 'middle' };
      tl.font = { name: FONT, size: 10, bold: true, color: { argb: BLACK } };
      var tq = tr.getCell(N);
      tq.value = items.length ? { formula: 'SUM(D' + first + ':D' + last + ')', result: items.reduce(function (s, it) { return s + (Number(it.qty) || 1); }, 0) } : 0;
      tq.font = { name: FONT, size: 10, bold: true, color: { argb: BLACK } }; tq.alignment = { horizontal: 'center', vertical: 'middle' };
      for (var k = 1; k <= N; k++) { var cell = tr.getCell(k); cell.fill = fill(GREEN_10); cell.border = { top: { style: 'medium', color: { argb: GREEN } }, bottom: thin, left: thin, right: thin }; }

      ws.views = [{ state: 'frozen', ySplit: headRow, showGridLines: false }];
      ws.pageSetup.printTitlesRow = headRow + ':' + headRow;

      return wb.xlsx.writeBuffer().then(function (buf) {
        return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      });
    });
  }

  window.LucasRFQExcel = { build: build, preload: loadLib, fileName: function (ref) { return 'Lucas-Inquiry-' + (ref || 'request') + '.xlsx'; } };
})();
