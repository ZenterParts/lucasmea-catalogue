/* Updates the public catalogue pages from the Master Data database (Supabase).
 *   node setup/publish-from-db.js snapshot.json [--dry] [--allow-removals]
 * snapshot.json comes from the "publish" edge function: { parts:[[pn,range,status]], oe:[[pn,number,brand]], comp:[[pn,number,brand]] }
 *
 * Stage 1: OE and cross-reference numbers of parts already on the website.
 * Numbers already on a page keep their exact text and order; numbers added in the database are appended,
 * numbers deleted in the database are removed. A page is only rewritten when something changed.
 * Safety: if a run would remove a lot of numbers at once (a sign of a bad snapshot), nothing is written
 * unless --allow-removals is given.
 * Writes a summary to publish-summary.json. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry'), ALLOW = args.includes('--allow-removals');
const snap = JSON.parse(fs.readFileSync(args.find(a => !a.startsWith('--')), 'utf8'));
const MAX_REMOVE = 100;

const ck = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const t = s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
// "RIDEX PLUS 1260W0346P" -> brand "RIDEX PLUS", number "1260W0346P" (brand = words before the first word with a digit)
function splitBrand(s) {
  const w = t(s).split(' '), i = w.findIndex(x => /\d/.test(x));
  return i <= 0 ? { brand: '', num: t(s) } : { brand: w.slice(0, i).join(' '), num: w.slice(i).join(' ') };
}
const isGeneric = b => !b || /^cross-?reference$/i.test(b);

// ---- database numbers per part
const DB = { oe: {}, comp: {} };
for (const [pn, num, brand] of snap.oe || []) if (ck(num)) (DB.oe[pn] = DB.oe[pn] || []).push({ num: t(num), brand: t(brand) });
for (const [pn, num, brand] of snap.comp || []) if (ck(num)) (DB.comp[pn] = DB.comp[pn] || []).push({ num: t(num), brand: t(brand) });
if (!(snap.oe || []).length || !(snap.comp || []).length || !(snap.parts || []).length) { console.error('Snapshot looks empty, stopping.'); process.exit(2); }

// ---- reading / writing the data literal embedded in a page
function span(src, name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(src);
  if (!m) throw new Error(name + ' not found');
  const i = m.index + m[0].length, open = src[i], close = open === '[' ? ']' : '}';
  let d = 0, q = null, e = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === q) q = null; continue; }
    if (c === '"') { q = c; continue; }
    if (c === open) d++; else if (c === close && !--d) return [i, j + 1];
  }
  throw new Error(name + ' not closed');
}
// same JSON style as the page already uses: compact, or Python style (", " and ": ")
function serialize(obj, pySpaces) {
  const s = JSON.stringify(obj);
  if (!pySpaces) return s;
  let out = '', q = false, e = false;
  for (const c of s) {
    out += c;
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') q = false; continue; }
    if (c === '"') q = true; else if (c === ',' || c === ':') out += ' ';
  }
  return out;
}

/* merge: keep page entries still in the database (exact text, same order), add the new ones.
   entries: [{key, ...}] from the page; want: [{num, brand}] from the database.
   returns { keep: [...page entries], add: [...db entries], removed: n } */
function merge(entries, want) {
  const wantKeys = new Set(want.map(w => ck(w.num)));
  const keysOf = e => [].concat(e.key).filter(Boolean);
  const have = new Set(entries.flatMap(keysOf));
  const keep = entries.filter(e => !keysOf(e).length || keysOf(e).some(k => wantKeys.has(k)));
  const added = new Set(), add = [];
  for (const w of want) { const k = ck(w.num); if (!have.has(k) && !added.has(k)) { added.add(k); add.push(w); } }
  return { keep, add, removed: entries.length - keep.length };
}

const report = { pages: {}, added: 0, removed: 0, changedParts: [], notOnWebsite: [], skipped: [] };
function note(page, pn, kind, m) {
  if (!m.add.length && !m.removed) return false;
  const r = report.pages[page] = report.pages[page] || { added: 0, removed: 0, parts: 0 };
  r.added += m.add.length; r.removed += m.removed; report.added += m.add.length; report.removed += m.removed;
  report.changedParts.push({ page, pn, kind, added: m.add.map(a => (a.brand && !isGeneric(a.brand) ? a.brand + ' ' : '') + a.num), removed: m.removed });
  return true;
}

// list fields: array of strings ("1234", or "BRAND 1234" when withBrand)
function listField(page, p, pn, field, want, kind, withBrand) {
  if (!Array.isArray(p[field]) && !want.length) return false;
  const arr = p[field] || [];
  const entries = arr.map(s => ({ s, key: withBrand ? [ck(splitBrand(s).num), ck(s)] : ck(s) }));
  const m = merge(entries, want);
  if (!note(page, pn, kind, m)) return false;
  p[field] = m.keep.map(e => e.s).concat(m.add.map(w => withBrand && !isGeneric(w.brand) ? w.brand + ' ' + w.num : w.num));
  return true;
}
// text fields: "a, b, c" (or "a / b")
function textField(page, p, pn, field, want, kind, sep) {
  const parts = t(p[field]) ? String(p[field]).split(sep === ' / ' ? sep : sep.trim()).map(x => x.trim()).filter(Boolean) : [];
  const m = merge(parts.map(s => ({ s, key: ck(s) })), want);
  if (!note(page, pn, kind, m)) return false;
  p[field] = m.keep.map(e => e.s).concat(m.add.map(w => w.num)).join(sep);
  return true;
}
const byBrand = (list, brand) => list.filter(w => (w.brand || '').toUpperCase() === brand);

// ---- one adapter per catalogue page
const PAGES = {
  'water-pumps': { name: 'DATA', list: d => d, pn: p => p.l, std: true },
  alternators: { name: 'DATA', list: d => d, pn: p => p.l, std: true },
  starters: { name: 'DATA', list: d => d, pn: p => p.l, std: true },
  horns: { name: 'DATA', list: d => d, pn: p => p.code, apply(p, pn, oe, comp) {
    const entries = (p.comp || []).map(c => ({ c, key: ck(c[1]) })), m = merge(entries, comp);
    if (oe.length) report.skipped.push({ page: 'horns', pn, why: 'Horns page has no OE numbers', count: oe.length });
    if (!note('horns', pn, 'cross-reference', m)) return false;
    p.comp = m.keep.map(e => e.c).concat(m.add.map(w => [isGeneric(w.brand) ? '' : w.brand, w.num])); return true;
  } },
  bulbs: { name: 'PARTS', list: d => d, pn: p => p.no, apply(p, pn, oe, comp) {
    let ch = false;
    for (const [key, brand] of [['os', 'OSRAM'], ['ph', 'PHILIPS'], ['he', 'HELLA']]) ch = textField('bulbs', p, pn, key, byBrand(comp, brand), brand, ' / ') || ch;
    const other = comp.filter(w => !['OSRAM', 'PHILIPS', 'HELLA'].includes((w.brand || '').toUpperCase()));
    if (other.length) report.skipped.push({ page: 'bulbs', pn, why: 'Bulbs page only shows Osram, Philips and Hella numbers', count: other.length });
    if (oe.length) report.skipped.push({ page: 'bulbs', pn, why: 'Bulbs page has no OE numbers', count: oe.length });
    return ch;
  } },
  'wiper-blades': { name: 'PARTS', list: d => d, pn: p => p.no, apply(p, pn, oe, comp) {
    if (oe.length) report.skipped.push({ page: 'wiper-blades', pn, why: 'Wiper page has no OE numbers', count: oe.length });
    // wiper cross references are stored as text, brand included ("DENSO DM-030")
    const want = comp.map(w => ({ num: isGeneric(w.brand) ? w.num : w.brand + ' ' + w.num, brand: '' }));
    return textField('wiper-blades', p, pn, 'xref', want, 'cross-reference', ', ');
  } },
  'gas-springs': { name: 'PARTS', list: d => d, pn: p => p.no, apply(p, pn, oe, comp, ctx) {
    let want = comp.map(w => ({ num: isGeneric(w.brand) ? w.num : w.brand + ' ' + w.num, brand: '' }));
    // a part can be listed on several rows (one per vehicle); each row keeps its own numbers and a new
    // number goes on one row only: an OE on the row of its vehicle make, a cross reference on the first row
    const rows = ctx.group[pn];
    if (rows.length > 1) {
      const keys = (r, f) => new Set(t(r[f]) ? String(r[f]).split(',').map(ck).filter(Boolean) : []);
      const pick = (list, f, target) => { const mine = keys(p, f), all = new Set(rows.flatMap(r => [...keys(r, f)]));
        return list.filter(w => mine.has(ck(w.num)) || (!all.has(ck(w.num)) && target(w) === p)); };
      oe = pick(oe, 'oe', w => rows.find(r => w.brand && t(r.make).toUpperCase() === w.brand.toUpperCase()) || rows[0]);
      want = pick(want, 'xref', () => rows[0]);
    }
    const a = textField('gas-springs', p, pn, 'oe', oe, 'OE', ', ');
    return textField('gas-springs', p, pn, 'xref', want, 'cross-reference', ', ') || a;
  } },
  filters: { name: 'D', list: d => d.p, pn: p => p.no, apply(p, pn, oe, comp, ctx) {
    const a = listField('filters', p, pn, 'oe', oe, 'OE', false);
    // cross references: main brands (XO list on the page) in p.x {BRAND:[...]}, everything else in p.oth ["BRAND 123"]
    const entries = [];
    for (const [b, nums] of Object.entries(p.x || {})) nums.forEach(n => entries.push({ where: 'x', b, s: n, key: ck(n) }));
    (p.oth || []).forEach(s => entries.push({ where: 'oth', s, key: [ck(splitBrand(s).num), ck(s)] }));
    const m = merge(entries, comp);
    if (!note('filters', pn, 'cross-reference', m)) return a;
    const x = {}, oth = [];
    for (const e of m.keep) if (e.where === 'x') (x[e.b] = x[e.b] || []).push(e.s); else oth.push(e.s);
    for (const w of m.add) {
      const B = (w.brand || '').toUpperCase();
      if (ctx.XO.includes(B)) (x[B] = x[B] || []).push(w.num); else oth.push(isGeneric(w.brand) ? w.num : w.brand + ' ' + w.num);
    }
    // keep the page's brand order
    const ordered = {}; for (const b of Object.keys(p.x || {}).concat(Object.keys(x))) if (x[b] && !ordered[b]) ordered[b] = x[b];
    p.x = ordered; p.oth = oth; return true;
  } },
};
// water pumps / alternators / starters: oe ["123"], x ["BRAND 123"]
function stdApply(page) {
  return function (p, pn, oe, comp) {
    const a = listField(page, p, pn, 'oe', oe, 'OE', false);
    return listField(page, p, pn, 'x', comp, 'cross-reference', true) || a;
  };
}

const onSite = new Set(), toWrite = [];
for (const [page, A] of Object.entries(PAGES)) {
  const file = path.join(ROOT, page, 'index.html'), src = fs.readFileSync(file, 'utf8');
  const [i, j] = span(src, A.name), lit = src.slice(i, j), data = JSON.parse(lit);
  const py = serialize(data, false) !== lit;
  if (py && serialize(data, true) !== lit) throw new Error(page + ': cannot reproduce the page data exactly, stopping');
  const ctx = { group: {} };
  for (const p of A.list(data)) (ctx.group[A.pn(p)] = ctx.group[A.pn(p)] || []).push(p);
  if (page === 'filters') ctx.XO = JSON.parse(/const XO=(\[[^\]]*\])/.exec(src)[1].replace(/'/g, '"'));
  const apply = A.apply || stdApply(page);
  let changed = 0;
  for (const p of A.list(data)) {
    const pn = A.pn(p); onSite.add(pn);
    if (apply(p, pn, DB.oe[pn] || [], DB.comp[pn] || [], ctx)) changed++;
  }
  if (changed) { report.pages[page].parts = changed; toWrite.push([file, src.slice(0, i) + serialize(data, py) + src.slice(j)]); }
}
for (const [pn, range] of snap.parts) if (!onSite.has(pn)) report.notOnWebsite.push(pn + ' (' + range + ')');

report.written = false;
if (report.removed > MAX_REMOVE && !ALLOW) {
  report.blocked = `This would remove ${report.removed} numbers from the website at once, so nothing was published. If that is intended, run the publish job manually with "allow removals".`;
} else if (!DRY) {
  for (const [f, s] of toWrite) fs.writeFileSync(f, s);
  report.written = toWrite.length > 0;
}
const summarySkipped = {}; for (const s of report.skipped) summarySkipped[s.why] = (summarySkipped[s.why] || 0) + s.count;
const out = { at: snap.at, pages: report.pages, added: report.added, removed: report.removed, written: report.written, blocked: report.blocked || null,
  changes: report.changedParts.slice(0, 200), notShownOnPages: summarySkipped, partsNotOnWebsite: report.notOnWebsite.length, partsNotOnWebsiteSample: report.notOnWebsite.slice(0, 20) };
fs.writeFileSync(process.env.PUBLISH_SUMMARY || 'publish-summary.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
if (report.blocked) process.exit(3);
