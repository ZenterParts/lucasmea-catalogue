/* Builds /assets/search-index.js for the home page "Search all catalogues" box.
 * Run from the repo root after any catalogue changes:   node setup/build-search-index.js
 * It reads the part data embedded in each catalogue page; nothing else is needed. */
const fs = require('fs');

function grab(file, name) {
  const s = fs.readFileSync(file, 'utf8');
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(s);
  if (!m) throw new Error(name + ' not found in ' + file);
  let i = m.index + m[0].length;
  const open = s[i], close = open === '[' ? ']' : '}';
  let d = 0, q = null, esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === open) d++; else if (c === close && !--d) return JSON.parse(s.slice(i, j + 1));
  }
}
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[\s\-_./(),;:'"]+/g, '');
// every word, plus each comma/semicolon item as one piece (so "W 67/1" also matches "w671")
function words(list) {
  const out = new Set();
  [].concat(list).flat(Infinity).forEach(v => {
    if (v == null || v === '') return;
    String(v).split(/[,;|]/).forEach(item => {
      const whole = norm(item); if (whole) out.add(whole);
      item.split(/\s+/).forEach(w => { const n = norm(w); if (n.length > 1) out.add(n); });
    });
  });
  return out;
}
const rows = [];
function add(no, cat, desc, sources) {
  const w = words(sources); w.add(norm(no));
  // drop words already contained in a longer word of the same part (substring search still finds them)
  const list = [...w].sort((a, b) => b.length - a.length), keep = [];
  list.forEach(x => { if (!keep.some(k => k.includes(x))) keep.push(x); });
  rows.push([no, cat, desc, keep.join(' ')]);
}
const CATS = [
  ['Gas Springs', '/gas-springs/'], ['Horns', '/horns/'], ['Bulbs', '/bulbs/'], ['Filters', '/filters/'],
  ['Wiper Blades', '/wiper-blades/'], ['Water Pumps', '/water-pumps/'],
  ['Starters', '/starters/'], ['Alternators', '/alternators/'], ['Girling Batteries', '/batteries/'], ['Ignition Coils', '/ignition-coils/']
];

grab('gas-springs/index.html', 'PARTS').forEach(p =>
  add(p.no, 0, 'Gas spring, ' + [p.make, p.app].filter(Boolean).join(' '), [p.make, p.app, p.fit, p.oe, p.xref]));

grab('horns/index.html', 'DATA').forEach(p =>
  add(p.code, 1, [p.type, p.volt, p.desc].filter(Boolean).join(', '), [p.type, p.volt, p.desc, (p.comp || []).map(c => [c[0], c[1], c[0] + ' ' + c[1]])]));

grab('bulbs/index.html', 'PARTS').forEach(p =>
  add(p.no, 2, ['Bulb', p.item, p.rngName, p.v && p.v + 'V', p.w && p.w + 'W', p.base].filter(Boolean).join(' '),
      [p.type, p.item, p.rng, p.rngName, p.base, p.v && p.v + 'v', p.w && p.w + 'w', p.os, p.ph, p.he, p.fa, 'osram', 'philips', 'hella']));

// Filters: one catalogue for oil, air, fuel and cabin filters. Each vehicle row lists its oil, air, fuel and cabin filter numbers.
const fil = grab('filters/index.html', 'D'), filVeh = {};
fil.v.forEach(r => {
  const veh = [fil.mk[r[0]], fil.md[r[1]], r[2], r[3]];
  [r[8], r[9], r[10], r[12]].forEach(list => String(list || '').split(' ').filter(Boolean).forEach(lp => (filVeh[lp] = filVeh[lp] || []).push(veh)));
});
const FKIND = { o: 'Oil filter', a: 'Air filter', f: 'Fuel filter', c: 'Cabin filter' };
fil.p.forEach(p => {
  const kind = FKIND[p.c], dl = (p.desc || '').toLowerCase(), base = kind.split(' ')[0].toLowerCase();
  const sub = p.desc && dl !== kind.toLowerCase() && !(dl.includes(base) && dl.includes('filter')) ? p.desc : '';
  let size = '';
  if (p.sz) { const v = p.sz[0].split(' · '); size = /supplier/i.test(p.sz[1]) ? p.sz[0] : v[0] + ' mm' + (v[1] ? ', ' + v[1] : ''); }
  add(p.no, 3, [kind, sub, size].filter(Boolean).join(', '), [kind, p.desc, p.sz && p.sz[0], Object.values(p.x || {}), Object.keys(p.x || {}), p.oe, p.oth, filVeh[p.no] || []]);
});

grab('wiper-blades/index.html', 'PARTS').forEach(p =>
  add(p.no, 4, p.desc, [p.desc, p.type, p.range, p.inch, p.mm && p.mm + 'mm', p.xref]));

grab('water-pumps/index.html', 'DATA').forEach(p =>
  add(p.l, 5, p.d || 'Water pump', [p.d, p.mk, p.oe, p.x, p.f]));

// Starters and alternators: index the Lucas number and every order code (N / R, or the LRCG number for components)
grab('starters/index.html', 'DATA').forEach(p =>
  add(p.l, 6, p.d || 'Starter motor', [p.d, p.mk, p.oe, p.x, p.f, (p.v || []).map(o => o.s)]));

grab('alternators/index.html', 'DATA').forEach(p =>
  add(p.l, 7, p.d || 'Alternator', [p.d, p.mk, p.oe, p.x, p.f, (p.v || []).map(o => o.s)]));

// Girling batteries: the catalogue keeps its data in <script type="application/json"> blocks
function grabJson(file, id) {
  const s = fs.readFileSync(file, 'utf8'), m = new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>').exec(s);
  if (!m) throw new Error(id + ' not found in ' + file);
  return JSON.parse(m[1]);
}
const bat = grabJson('batteries/index.html', 'cat-data'), batVeh = {};
const sabOf = s => String(s || '').match(/\d{3}/g) || [];
const bySab = {}; bat.forEach(b => sabOf(b.sab).forEach(c => (bySab[c] = bySab[c] || []).push(b.pn)));
grabJson('batteries/index.html', 'veh-data').forEach(v => sabOf(v.r).forEach(c => (bySab[c] || []).forEach(pn => (batVeh[pn] = batVeh[pn] || new Set()).add(v.m))));
bat.forEach(b => add(b.pn, 8, ['Girling battery', b.series, b.ah + ' Ah', b.cca + ' A', b.box + ' case'].join(', '),
  ['battery', 'girling', b.series, b.group, b.box, b.ah + 'ah', b.cca + 'a', b.origin, 'sab ' + b.sab, b.sab, [...(batVeh[b.pn] || [])]]));

// Ignition coils: Lucas number, OE and cross-reference numbers, vehicle makes and models
grab('ignition-coils/index.html', 'DATA').forEach(p => {
  const pins = !p.pins || /not/i.test(p.pins) ? '' : p.pins.replace(/-pin/g, ' pin') + ' connector';
  const mod = p.mod === 'With module' ? 'with ignition module' : p.mod === 'Without module' ? 'without ignition module' : '';
  add(p.p, 9, ['Ignition coil', pins, mod].filter(Boolean).join(', '), ['ignition coil', p.mk, p.oem, (p.x || []).map(x => [x[1], x[0] + ' ' + x[1]]), (p.f || []).map(f => f[0] + ' ' + f[1])]);
});

const out = '/* Generated by setup/build-search-index.js — do not edit by hand. ' + new Date().toISOString().slice(0, 10) + ' */\n' +
  'window.LUCAS_SEARCH=' + JSON.stringify({ cats: CATS, rows }) + ';\n';
fs.writeFileSync('assets/search-index.js', out);
console.log(rows.length + ' parts, ' + (out.length / 1024).toFixed(0) + ' KB');
