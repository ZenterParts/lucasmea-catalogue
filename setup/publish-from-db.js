/* Updates the public catalogue pages from the Master Data database (Supabase).
 *   node setup/publish-from-db.js core.json [apps.json] [--dry] [--allow-removals]
 * The snapshot files come from the "publish" edge function:
 *   core: { at, parts:[[pn,range,status,desc,barcode,origin,notes]], oe:[[pn,num,brand]], comp:[[pn,num,brand]], specs:[[pn,attr,value]], bulbs:[[pn,type,item,range,V,W,base,K,ece]] }
 *   apps: { apps:[[pn,make,model,variant,engine,fuel,cc,kw,years,position,description]] }
 *
 * Published per part: OE and cross-reference numbers, description, specifications, vehicles,
 * new parts (status Active) and removed parts (deleted, or status no longer Active).
 * Principle: a page is only touched where the database says something different from what the page
 * already shows, so an unchanged database gives an unchanged website, and page details the database
 * does not hold (pictures, catalogue page numbers, groupings) are kept.
 * Safety: a run that would remove a lot at once publishes nothing unless --allow-removals is given.
 * Writes a summary to $PUBLISH_SUMMARY (default publish-summary.json). */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry'), ALLOW = args.includes('--allow-removals');
const snap = {}; for (const f of args.filter(a => !a.startsWith('--'))) Object.assign(snap, JSON.parse(fs.readFileSync(f, 'utf8')));
const LIMITS = { numbers: 100, parts: 25, vehicles: 500 };

// ---------- helpers
const ck = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const t = s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
const low = s => t(s).toLowerCase();
const title = s => t(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function splitBrand(s) {   // "RIDEX PLUS 1260W0346P" -> brand "RIDEX PLUS", number "1260W0346P"
  const w = t(s).split(' '), i = w.findIndex(x => /\d/.test(x));
  return i <= 0 ? { brand: '', num: t(s) } : { brand: w.slice(0, i).join(' '), num: w.slice(i).join(' ') };
}
const isGeneric = b => !b || /^cross-?reference$/i.test(b);
const withUnit = (v, u) => { v = t(v); if (!v || !u || v.endsWith(u.trim())) return v; return v + (u.startsWith(' ') ? u : ' ' + u); };
const stripUnit = (v, u) => { v = t(v); if (!u) return v; const k = u.trim(); return v.endsWith(k) ? t(v.slice(0, -k.length)) : v; };
function insertSorted(list, item, keyFn) {  // keep the page's part-number order
  const k = keyFn(item), i = list.findIndex(x => keyFn(x) > k);
  if (i < 0) list.push(item); else list.splice(i, 0, item);
}

// ---------- database, per part
if (!(snap.parts || []).length || !(snap.oe || []).length || !(snap.comp || []).length) { console.error('Snapshot looks empty, stopping.'); process.exit(2); }
const HAS_APPS = Array.isArray(snap.apps), HAS_SPECS = Array.isArray(snap.specs);
const DB = {};
for (const [pn, sub, status, desc, barcode, origin, notes] of snap.parts) DB[pn] = { pn, sub, status: status || 'Active', desc: t(desc), barcode: t(barcode), origin: t(origin), notes: t(notes), oe: [], comp: [], specs: [], apps: [], bulb: null };
const get = pn => DB[pn] || { pn, oe: [], comp: [], specs: [], apps: [] };
for (const [pn, num, brand] of snap.oe) if (DB[pn] && ck(num)) DB[pn].oe.push({ num: t(num), brand: t(brand) });
for (const [pn, num, brand] of snap.comp) if (DB[pn] && ck(num)) DB[pn].comp.push({ num: t(num), brand: t(brand) });
for (const [pn, a, v] of snap.specs || []) if (DB[pn] && t(v) && !DB[pn].specs.some(s => s[0] === t(a))) DB[pn].specs.push([t(a), t(v)]);
for (const [pn, type, item, range, V, W, base, K, ece] of snap.bulbs || []) if (DB[pn]) DB[pn].bulb = { type, item, rng: range, v: V, w: W, base, k: K, ece };
const APP_F = ['make', 'model', 'variant', 'engine_code', 'fuel', 'cc', 'kw', 'years', 'position', 'description'];
for (const r of snap.apps || []) if (DB[r[0]]) { const a = {}; APP_F.forEach((f, i) => { a[f] = t(r[i + 1]); }); DB[r[0]].apps.push(a); }
const specOf = (db, name) => { const s = db.specs.find(x => x[0].toLowerCase() === name.toLowerCase()); return s ? s[1] : ''; };
const active = pn => DB[pn] && DB[pn].status === 'Active';

// ---------- report
const R = { numbersAdded: 0, numbersRemoved: 0, partsAdded: [], partsRemoved: [], partsUpdated: new Set(), vehiclesAdded: 0, vehiclesRemoved: 0, changes: [], notShown: {}, pages: {} };
function log(page, pn, kind, what) {
  R.changes.push(Object.assign({ page, pn, kind }, what));
  const p = R.pages[page] = R.pages[page] || { changes: 0 }; p.changes++;
  if (kind !== 'new part' && kind !== 'removed part') R.partsUpdated.add(pn);
}
const notShown = (why, n) => { R.notShown[why] = (R.notShown[why] || 0) + (n || 1); };

// ---------- numbers (OE / cross references)
function merge(entries, want) {  // keep page entries still in the database (exact text, order), add new ones
  const wantKeys = new Set(want.map(w => ck(w.num)));
  const keysOf = e => [].concat(e.key).filter(Boolean);
  const have = new Set(entries.flatMap(keysOf));
  const keep = entries.filter(e => !keysOf(e).length || keysOf(e).some(k => wantKeys.has(k)));
  const added = new Set(), add = [];
  for (const w of want) { const k = ck(w.num); if (!have.has(k) && !added.has(k)) { added.add(k); add.push(w); } }
  return { keep, add, removed: entries.length - keep.length };
}
const label = w => (w.brand && !isGeneric(w.brand) ? w.brand + ' ' : '') + w.num;
function noteNums(page, pn, kind, m) {
  if (!m.add.length && !m.removed) return false;
  R.numbersAdded += m.add.length; R.numbersRemoved += m.removed;
  log(page, pn, kind, { added: m.add.map(label), removed: m.removed });
  return true;
}
function listField(page, p, pn, field, want, kind, withBrand) {
  if (!Array.isArray(p[field]) && !want.length) return false;
  const entries = (p[field] || []).map(s => ({ s, key: withBrand ? [ck(splitBrand(s).num), ck(s)] : ck(s) }));
  const m = merge(entries, want);
  if (!noteNums(page, pn, kind, m)) return false;
  p[field] = m.keep.map(e => e.s).concat(m.add.map(w => withBrand && !isGeneric(w.brand) ? w.brand + ' ' + w.num : w.num));
  return true;
}
function textField(page, p, pn, field, want, kind, sep) {
  const parts = t(p[field]) ? String(p[field]).split(sep === ' / ' ? sep : sep.trim()).map(x => x.trim()).filter(Boolean) : [];
  const m = merge(parts.map(s => ({ s, key: ck(s) })), want);
  if (!noteNums(page, pn, kind, m)) return false;
  p[field] = m.keep.map(e => e.s).concat(m.add.map(w => w.num)).join(sep);
  return true;
}
const byBrand = (list, brand) => list.filter(w => (w.brand || '').toUpperCase() === brand);
const brandInText = list => list.map(w => ({ num: isGeneric(w.brand) ? w.num : w.brand + ' ' + w.num, brand: '' }));

// set a simple field when the database differs
function setField(page, p, pn, field, dbVal, what) {
  if (t(dbVal) === t(p[field])) return false;
  log(page, pn, what || field, { from: t(p[field]), to: t(dbVal) });
  p[field] = dbVal;
  return true;
}
// specification maps (key -> value on the page; label + unit in the database). Labels the page has no field for are left out.
function specsSync(page, p, pn, db, LAB, toKey, skip) {
  // only fields the page knows are compared; other page values (e.g. internal flags) are kept as they are
  const s = p.s || {};
  const pageMap = {}; for (const [k, v] of Object.entries(s)) { if (!LAB[k]) continue; const [l, u] = LAB[k]; if (t(v) && !(l in pageMap)) pageMap[l] = withUnit(v, u); }
  const dbMap = {};
  for (const [a, v] of db.specs) {
    if (skip.includes(a)) continue;
    if (!LAB[toKey(a)]) { notShown('Specifications the page has no field for (kept in the database)'); continue; }
    dbMap[a] = v;
  }
  if (same(Object.entries(pageMap).sort(), Object.entries(dbMap).sort())) return false;
  const out = {};
  for (const k of Object.keys(s)) { if (!LAB[k]) { out[k] = s[k]; continue; } const [l, u] = LAB[k]; if (l in dbMap) out[k] = stripUnit(dbMap[l], u); }
  for (const [a, v] of Object.entries(dbMap)) { const k = toKey(a); if (!(k in out)) out[k] = stripUnit(v, (LAB[k] || [])[1]); }
  log(page, pn, 'specifications', { from: pageMap, to: dbMap });
  p.s = out; return true;
}
// vehicles as "make + text line" (water pumps, alternators, starters)
function appsLines(page, p, pn, db) {
  const mk = p.mk || [], f = p.f || [];
  const one = mk.length === 1 ? mk[0] : '';
  const pageApps = f.length ? f.map(line => (mk.find(m => line.toUpperCase().startsWith(m.toUpperCase())) || one) + '|' + t(line)) : mk.map(m => m + '|');
  const dbApps = db.apps.map(a => a.make + '|' + a.description);
  if (same([...new Set(pageApps)].sort(), [...new Set(dbApps)].sort())) return false;
  const descs = [...new Set(db.apps.map(a => a.description).filter(Boolean))];
  const keepF = f.filter(line => descs.includes(t(line)));
  const newF = keepF.concat(descs.filter(d => !keepF.some(l => t(l) === d)));
  const makes = [...new Set(db.apps.map(a => a.make).filter(Boolean))];
  const keepMk = mk.filter(m => makes.includes(m) || newF.some(l => l.toUpperCase().includes(m.toUpperCase())));
  const newMk = keepMk.concat(makes.filter(m => !keepMk.includes(m)));
  const added = newF.length ? newF.filter(l => !f.includes(l)) : newMk.filter(m => !mk.includes(m));
  const removed = newF.length || f.length ? f.filter(l => !newF.includes(l)).length : mk.filter(m => !newMk.includes(m)).length;
  R.vehiclesAdded += added.length; R.vehiclesRemoved += removed;
  log(page, pn, 'vehicles', { added, removed });
  p.mk = newMk;
  if (newF.length) p.f = newF; else delete p.f;
  return true;
}

// ---------- reading / writing the data embedded in a page
function span(src, name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*').exec(src);
  if (!m) throw new Error(name + ' not found');
  const i = m.index + m[0].length, open = src[i], close = open === '[' ? ']' : '}';
  let d = 0, q = null, e = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === open) d++; else if (c === close && !--d) return [i, j + 1];
  }
  throw new Error(name + ' not closed');
}
function serialize(obj, py) {  // same JSON style the page already uses: compact, or Python style
  const s = JSON.stringify(obj);
  if (!py) return s;
  let out = '', q = false, e = false;
  for (const c of s) {
    out += c;
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') q = false; continue; }
    if (c === '"') q = true; else if (c === ',' || c === ':') out += ' ';
  }
  return out;
}
class Page {
  constructor(dir) { this.dir = dir; this.file = path.join(ROOT, dir, 'index.html'); this.src = fs.readFileSync(this.file, 'utf8'); this.lits = {}; }
  read(name) {
    const [i, j] = span(this.src, name), lit = this.src.slice(i, j);
    let data;
    try { data = JSON.parse(lit); } catch (e) {   // small settings written as plain JavaScript: rewritten as JSON only if they change
      data = Function('"use strict"; return (' + lit + ')')();
      this.lits[name] = { data, js: JSON.stringify(data), orig: lit };
      return data;
    }
    const py = serialize(data, false) !== lit;
    if (py && serialize(data, true) !== lit) throw new Error(this.dir + ' ' + name + ': cannot reproduce the page data exactly, stopping');
    this.lits[name] = { data, py, orig: lit };
    return data;
  }
  render() {
    let src = this.src;
    for (const [name, L] of Object.entries(this.lits)) {
      if (L.js !== undefined && JSON.stringify(L.data) === L.js) continue;
      const out = L.js !== undefined ? JSON.stringify(L.data) : serialize(L.data, L.py); if (out === L.orig) continue;
      const [i, j] = span(src, name); src = src.slice(0, i) + out + src.slice(j);
    }
    return src;
  }
}

// ---------- the pages
const PAGES = [], SUB_PAGE = {};
function page(dir, subs, cfg) { PAGES.push(Object.assign({ dir, subs }, cfg)); subs.forEach(s => { SUB_PAGE[s] = dir; }); }

// Water pumps
page('water-pumps', ['Water Pumps'], {
  load(pg) {
    const data = pg.read('DATA'), M = pg.read('MLAB'), E = pg.read('ELAB');
    this.LAB = {}; for (const [k, l, u] of M.concat(E)) if (!this.LAB[k]) this.LAB[k] = [l, u];
    this.toKey = {}; for (const [k, l] of M.concat(E)) if (!this.toKey[l]) this.toKey[l] = k;
    if (!this.LAB.mode) { this.LAB.mode = ['Mode']; this.toKey.Mode = 'mode'; }   // stored as "Mode" in the database
    return data;
  },
  pn: d => d.l,
  numbers(d, pn, db) { const a = listField(this.dir, d, pn, 'oe', db.oe, 'OE', false); return listField(this.dir, d, pn, 'x', db.comp, 'cross-reference', true) || a; },
  fields(d, pn, db) {
    if (db.desc) setField(this.dir, d, pn, 'd', db.desc, 'description');
    if (HAS_SPECS) {
      const type = specOf(db, 'Type');
      if (type) { const k = /electric/i.test(type) ? 'e' : 'm'; if (k !== d.k) { log(this.dir, pn, 'type', { from: d.k, to: k }); d.k = k; } }
      specsSync(this.dir, d, pn, db, this.LAB, l => this.toKey[l] || l, ['Type']);
    }
    if (HAS_APPS) appsLines(this.dir, d, pn, db);
  },
  create(db) { const d = { l: db.pn, k: 'm', d: db.desc, mk: [], oe: [], x: [], s: {}, i: -1 }; this.fields(d, db.pn, db); return [d]; },
});

// Alternators and starters (same layout)
const AL = { volt: ['Voltage', 'V'], amp: ['Current', 'A'], kw: ['Power', 'kW'], pul: ['Pulley'], rot: ['Rotation'], term: ['Terminal / regulator'], code: ['Code'], part: ['Component'], teeth: ['Teeth'] };
const AL_KEY = {}; for (const [k, [l]] of Object.entries(AL)) AL_KEY[l] = k;
for (const [dir, sub] of [['alternators', 'Alternators'], ['starters', 'Starters']]) page(dir, [sub], {
  load(pg) { const data = pg.read('DATA'); this.ORIGINS = pg.read('ORIGINS'); this.COND = pg.read('COND'); return data; },
  pn: d => d.l,
  numbers(d, pn, db) { const a = listField(this.dir, d, pn, 'oe', db.oe, 'OE', false); return listField(this.dir, d, pn, 'x', db.comp, 'cross-reference', true) || a; },
  originCode(name) {
    const hit = Object.entries(this.ORIGINS).find(([, n]) => low(n) === low(name)); if (hit) return hit[0];
    const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase() || 'XX';
    let code = letters.slice(0, 2), i = 2;
    while (this.ORIGINS[code]) code = letters[0] + (letters[i++] || String(i));
    this.ORIGINS[code] = t(name); return code;
  },
  fields(d, pn, db) {
    if (db.desc) setField(this.dir, d, pn, 'd', db.desc, 'description');
    const v = (d.v || [])[0] || { s: pn, c: '', o: '' };
    const putV = () => { if (!d.v || !d.v.length) d.v = [v]; };
    if (db.origin && low(this.ORIGINS[v.o] || '') !== low(db.origin)) { log(this.dir, pn, 'origin', { from: this.ORIGINS[v.o] || '', to: db.origin }); v.o = this.originCode(db.origin); putV(); }
    const oc = /Order code (\S+)/i.exec(db.notes || ''); if (oc && oc[1] !== v.s) { log(this.dir, pn, 'order code', { from: v.s, to: oc[1] }); v.s = oc[1]; putV(); }
    if (HAS_SPECS) {
      const type = specOf(db, 'Type'), comp = /component/i.test(type);
      if (type && comp !== (d.k === 'c')) { log(this.dir, pn, 'type', { from: d.k === 'c' ? 'component' : 'complete unit', to: type }); if (comp) d.k = 'c'; else delete d.k; }
      const cond = specOf(db, 'Condition');
      if (cond && low(this.COND[v.c] || v.c) !== low(cond)) {
        const c = Object.keys(this.COND).find(k => low(this.COND[k]) === low(cond));
        if (c) { log(this.dir, pn, 'condition', { from: this.COND[v.c] || v.c, to: cond }); v.c = c; putV(); } else notShown('Conditions other than New / Reman');
      }
      specsSync(this.dir, d, pn, db, AL, l => AL_KEY[l] || l, ['Type', 'Condition']);
    }
    if (HAS_APPS) appsLines(this.dir, d, pn, db);
  },
  create(db) {
    const d = { l: db.pn, oe: [], x: [], mk: [], i: -1, s: {}, v: [{ s: db.pn, c: '', o: '' }], d: db.desc };
    this.fields(d, db.pn, db); return [d];
  },
});

// Horns
const HORN = { type: 'Type', volt: 'Voltage', desc: 'Tone', freq: 'Frequency', db: 'Sound level', amp: 'Current', size: 'Size' };
page('horns', ['Horns'], {
  load(pg) { const data = pg.read('DATA'); this.MODELS = pg.read('MODELS'); this.data = data; return data; },
  pn: h => h.code,
  numbers(h, pn, db) {
    if (db.oe.length) notShown('OE numbers on the Horns page (it has no OE column)', db.oe.length);
    const m = merge((h.comp || []).map(c => ({ c, key: ck(c[1]) })), db.comp);
    if (!noteNums(this.dir, pn, 'cross-reference', m)) return false;
    h.comp = m.keep.map(e => e.c).concat(m.add.map(w => [isGeneric(w.brand) ? '' : w.brand, w.num])); return true;
  },
  derive(h) {
    const mo = this.MODELS.find(m => low(m.name) === low(h.type)); if (mo) h.key = mo.key;
    const d = low(h.desc); h.cfg = /relay/.test(d) ? 'relay' : /&|set|pair/.test(d) ? 'set' : /low/.test(d) ? 'low' : 'high';
  },
  fields(h, pn, db) {
    let ch = false;
    if (HAS_SPECS) for (const [f, a] of Object.entries(HORN)) { const v = specOf(db, a); if (v || t(h[f])) ch = setField(this.dir, h, pn, f, v, a.toLowerCase()) || ch; }
    if (db.barcode && db.barcode !== t(h.bar)) { log(this.dir, pn, 'barcode', { from: t(h.bar), to: db.barcode }); h.bar = db.barcode; }
    if (ch) this.derive(h);
  },
  create(db) { const h = { code: db.pn, comp: [] }; for (const [f, a] of Object.entries(HORN)) h[f] = specOf(db, a); h.bar = db.barcode; this.derive(h); return [h]; },
  finish() {  // the model cards show how many parts and which voltages each model has
    for (const m of this.MODELS) {
      const its = this.data.filter(h => h.key === m.key);
      const volts = [...new Set(its.map(h => h.volt).filter(Boolean))].sort();
      if (m.count !== its.length) m.count = its.length;
      if (volts.length && !same(m.volts, volts)) m.volts = volts;
    }
  },
});

// Bulbs
page('bulbs', ['Bulbs'], {
  load(pg) {
    const data = pg.read('PARTS'); this.TYPES = pg.read('TYPE_ORDER');
    this.RN = {}; for (const b of data) if (b.rng && b.rngName) this.RN[b.rng] = b.rngName;
    return data;
  },
  pn: b => b.no,
  numbers(b, pn, db) {
    let ch = false;
    for (const [key, brand] of [['os', 'OSRAM'], ['ph', 'PHILIPS'], ['he', 'HELLA']]) ch = textField(this.dir, b, pn, key, byBrand(db.comp, brand), brand, ' / ') || ch;
    const other = db.comp.filter(w => !['OSRAM', 'PHILIPS', 'HELLA'].includes((w.brand || '').toUpperCase()));
    if (other.length) notShown('Bulb cross references other than Osram, Philips and Hella', other.length);
    if (db.oe.length) notShown('OE numbers on the Bulbs page (it has no OE column)', db.oe.length);
    return ch;
  },
  fields(b, pn, db) {
    if (!db.bulb) return;
    const x = db.bulb, typ = this.TYPES.find(ty => low(ty) === low(x.type)) || this.TYPES.find(ty => low(ty).startsWith(low(x.type) + ' ')) || title(x.type);
    const F = { type: typ, item: x.item, rng: x.rng, v: x.v, w: x.w, base: x.base, k: x.k == null ? '' : String(x.k), ece: x.ece };
    for (const [f, v] of Object.entries(F)) {
      if (low(v) === low(b[f])) continue;
      log(this.dir, pn, f, { from: t(b[f]), to: t(v) }); b[f] = t(v);
      if (f === 'rng') b.rngName = this.RN[b.rng] || '';
    }
  },
  create(db) {
    const b = { no: db.pn, type: '', item: '', rng: '', rngName: '', v: '', w: '', base: '', k: '', ece: '', os: '', ph: '', he: '', fa: '', img: '', pg: null };
    this.fields(b, db.pn, db); return [b];
  },
});

// Wiper blades
page('wiper-blades', ['Wiper Blades'], {
  load(pg) { return pg.read('PARTS'); },
  pn: w => w.no,
  numbers(w, pn, db) {
    if (db.oe.length) notShown('OE numbers on the Wiper page (it has no OE column)', db.oe.length);
    return textField(this.dir, w, pn, 'xref', brandInText(db.comp), 'cross-reference', ', ');
  },
  fields(w, pn, db) {
    if (db.desc) setField(this.dir, w, pn, 'desc', db.desc, 'description');
    if (!HAS_SPECS) return;
    for (const [f, a] of [['type', 'Type'], ['range', 'Range'], ['inch', 'Length (in)']]) { const v = specOf(db, a); if (v) setField(this.dir, w, pn, f, v, a.toLowerCase()); }
    const mm = stripUnit(specOf(db, 'Length (mm)'), 'mm');
    if (mm && String(w.mm) !== mm) { log(this.dir, pn, 'length (mm)', { from: String(w.mm), to: mm }); w.mm = /^\d+(\.\d+)?$/.test(mm) ? Number(mm) : mm; }
  },
  create(db) { const w = { no: db.pn, desc: db.desc, type: '', range: '', inch: '', mm: '', xref: '' }; this.fields(w, db.pn, db); return [w]; },
});

// Gas springs: one row per vehicle application
const GS = [['ext', 'Extended length', 'mm'], ['stroke', 'Stroke', 'mm'], ['force', 'Force', 'N'], ['rod', 'Rod Ø', 'mm'], ['body', 'Body Ø', 'mm']];
const gsKey = (make, model, pos) => [low(make), low(model), low(pos)].join('|');
page('gas-springs', ['Gas Springs'], {
  load(pg) { return pg.read('PARTS'); },
  pn: g => g.no,
  grouped: true,   // all rows of one part are handled together
  numbers(rows, pn, db) {
    for (const p of rows) {
      let oe = db.oe, want = brandInText(db.comp);
      if (rows.length > 1) {   // each row keeps its own numbers; a new OE goes on the row of its make, a new cross reference on the first row
        const keys = (r, f) => new Set(t(r[f]) ? String(r[f]).split(',').map(ck).filter(Boolean) : []);
        const pick = (list, f, target) => { const mine = keys(p, f), all = new Set(rows.flatMap(r => [...keys(r, f)]));
          return list.filter(w => mine.has(ck(w.num)) || (!all.has(ck(w.num)) && target(w) === p)); };
        oe = pick(oe, 'oe', w => rows.find(r => w.brand && low(r.make) === low(w.brand)) || rows[0]);
        want = pick(want, 'xref', () => rows[0]);
      }
      textField(this.dir, p, pn, 'oe', oe, 'OE', ', ');
      textField(this.dir, p, pn, 'xref', want, 'cross-reference', ', ');
    }
  },
  fields(rows, pn, db, ctx) {
    if (HAS_SPECS && db.specs.length) for (const [f, a, u] of GS) {
      const v = stripUnit(specOf(db, a), u);
      if (t(rows[0][f]) !== v) { log(this.dir, pn, a.toLowerCase(), { from: t(rows[0][f]), to: v }); rows.forEach(r => { r[f] = v; }); }
    }
    if (!HAS_APPS || !db.apps.length) return rows;
    const pageKeys = rows.map(r => gsKey(r.make, r.app, r.fit)), dbApps = db.apps.map(a => ({ a, key: gsKey(a.make, a.model, a.position) }));
    if (same([...new Set(pageKeys)].sort(), [...new Set(dbApps.map(x => x.key))].sort())) return rows;
    const keep = rows.filter((r, i) => dbApps.some(x => x.key === pageKeys[i]));
    const addApps = dbApps.filter(x => !pageKeys.includes(x.key)).filter((x, i, arr) => arr.findIndex(y => y.key === x.key) === i);
    const added = addApps.map(({ a }) => { const r = JSON.parse(JSON.stringify(rows[0])); r.make = a.make.toUpperCase(); r.app = a.model; r.fit = a.position; r.oe = ''; r.xref = ''; return r; });
    R.vehiclesAdded += added.length; R.vehiclesRemoved += rows.length - keep.length;
    log(this.dir, pn, 'vehicles', { added: addApps.map(x => [x.a.make, x.a.model, x.a.position].filter(Boolean).join(' ')), removed: rows.length - keep.length });
    const next = keep.concat(added); ctx.replace(rows, next); return next;
  },
  create(db) {
    const spec = {}; for (const [f, a, u] of GS) spec[f] = stripUnit(specOf(db, a), u);
    const apps = db.apps.length ? db.apps : [{ make: '', model: '', position: '' }];
    return apps.map(a => Object.assign({ no: db.pn, make: a.make.toUpperCase(), app: a.model, fit: a.position, oe: '', xref: '' }, spec));
  },
});

// Filters: oil, air, fuel and cabin on one page; vehicles are a separate table listing the filters per vehicle
const FC = { 'Oil Filters': 'o', 'Air Filters': 'a', 'Fuel Filters': 'f', 'Cabin Filters': 'c' };
const VCOL = { o: 8, a: 9, f: 10, c: 12 };
page('filters', Object.keys(FC), {
  load(pg) {
    this.D = pg.read('D'); this.CATS = pg.read('CATS');
    this.XO = JSON.parse(/const XO=(\[[^\]]*\])/.exec(pg.src)[1].replace(/'/g, '"'));
    this.CAT = {}; this.TN = {}; for (const c of this.CATS) { this.CAT[c.c] = c; for (const ty of c.types) this.TN[c.c + '/' + ty.k] = ty.name; }
    return this.D.p;
  },
  pn: p => p.no,
  sortKey: p => 'oafc'.indexOf(p.c) + p.no,
  numbers(p, pn, db) {
    const a = listField(this.dir, p, pn, 'oe', db.oe, 'OE', false);
    const entries = [];
    for (const [b, nums] of Object.entries(p.x || {})) nums.forEach(n => entries.push({ where: 'x', b, s: n, key: ck(n) }));
    (p.oth || []).forEach(s => entries.push({ where: 'oth', s, key: [ck(splitBrand(s).num), ck(s)] }));
    const m = merge(entries, db.comp);
    if (!noteNums(this.dir, pn, 'cross-reference', m)) return a;
    const x = {}, oth = [];
    for (const e of m.keep) if (e.where === 'x') (x[e.b] = x[e.b] || []).push(e.s); else oth.push(e.s);
    for (const w of m.add) { const B = (w.brand || '').toUpperCase(); if (this.XO.includes(B)) (x[B] = x[B] || []).push(w.num); else oth.push(isGeneric(w.brand) ? w.num : w.brand + ' ' + w.num); }
    const ordered = {}; for (const b of Object.keys(p.x || {}).concat(Object.keys(x))) if (x[b] && !ordered[b]) ordered[b] = x[b];
    p.x = ordered; p.oth = oth; return true;
  },
  typeName(c, k) { const n = this.TN[c + '/' + k] || ''; return c === 'c' ? n : n.replace(/s$/, '').replace(/s, /, ', '); },
  typeKey(c, name) { const ty = this.CAT[c].types.find(ty => low(this.typeName(c, ty.k)) === low(name)); return ty ? ty.k : null; },
  size(sp, pat) {   // the short size line shown in lists, e.g. "73 / 66 · M20 x 1.5"
    const g = n => { const s = sp.find(x => low(x[0]) === n); return s ? stripUnit(s[1], 'mm') : ''; };
    const L = g('length'), W = g('width'), H = g('height'), OD = g('outer diameter'), ID = g('inside diameter') || g('inner diameter'), TH = g('thread');
    const F = { 'L x W x H': L && W && H && `${L} x ${W} x ${H}`, 'H / OD · thread': H && OD && TH && `${H} / ${OD} · ${TH}`, 'H / OD / ID': H && OD && ID && `${H} / ${OD} / ${ID}`, 'H / OD': H && OD && `${H} / ${OD}` };
    if (pat && F[pat]) return [F[pat], pat];
    const k = Object.keys(F).find(k => F[k]); return k ? [F[k], k] : null;
  },
  fields(p, pn, db) {
    const one = this.CAT[p.c].one;
    if (db.desc) {
      const cur = /filter/i.test(p.desc) ? p.desc : `${p.desc} ${one}`, curCap = t(cur[0].toUpperCase() + cur.slice(1));
      if (curCap !== db.desc) {
        let nd = db.desc; if (low(nd).endsWith(' ' + one)) nd = t(nd.slice(0, -one.length));
        log(this.dir, pn, 'description', { from: curCap, to: db.desc }); p.desc = nd;
      }
    }
    if (!HAS_SPECS) return;
    const tv = specOf(db, p.c === 'c' ? 'Group' : 'Type');
    if (tv && low(tv) !== low(this.typeName(p.c, p.t))) {
      const k = this.typeKey(p.c, tv);
      if (k) { log(this.dir, pn, 'type', { from: this.typeName(p.c, p.t), to: tv }); p.t = k; } else notShown('Filter types the page has no group for');
    }
    const dbSp = db.specs.filter(s => s[0] !== 'Type' && s[0] !== 'Group');
    const pageSp = (p.sp || []).map(s => [t(s[0]), t(s[1])]).filter((s, i, a) => s[1] && a.findIndex(y => y[0] === s[0]) === i);
    if (same(pageSp.map(s => s.join('=')).sort(), dbSp.map(s => s.join('=')).sort())) return;
    const dbMap = Object.fromEntries(dbSp), out = [];
    for (const [a] of p.sp || []) if (t(a) in dbMap && !out.some(s => s[0] === t(a))) out.push([t(a), dbMap[t(a)]]);
    for (const s of dbSp) if (!out.some(o => o[0] === s[0])) out.push(s);
    log(this.dir, pn, 'specifications', { from: Object.fromEntries(pageSp), to: dbMap });
    p.sp = out;
    if (!(p.sz && p.sz[1] === 'Supplier size')) p.sz = this.size(out, p.sz && p.sz[1]);
  },
  create(db) {
    const c = FC[db.sub], tv = specOf(db, c === 'c' ? 'Group' : 'Type');
    const other = this.CAT[c].types.find(ty => /^other/i.test(ty.name)) || this.CAT[c].types[0];
    const one = this.CAT[c].one; let desc = db.desc; if (low(desc).endsWith(' ' + one)) desc = t(desc.slice(0, -one.length));
    const sp = db.specs.filter(s => s[0] !== 'Type' && s[0] !== 'Group');
    return [{ no: db.pn, c, t: (tv && this.typeKey(c, tv)) || other.k, desc: desc || one, sz: this.size(sp, null), sp, x: {}, oe: [], oth: [], n: 0 }];
  },
  finish() {   // vehicle table: which filters fit which vehicle
    const D = this.D;
    if (HAS_APPS) {
      const vk = (mk, md, v, e, fu, cc, kw, y) => [mk, md, v, e, fu, cc, kw, y].map(low).join('|');
      const want = new Map();  // vehicle -> filters per category
      for (const p of D.p) for (const a of get(p.no).apps) {
        const k = vk(a.make, a.model, a.variant, a.engine_code, a.fuel, a.cc, a.kw, a.years);
        if (!want.has(k)) want.set(k, { app: a, o: [], a: [], f: [], c: [] });
        const w = want.get(k); if (!w[p.c].includes(p.no)) w[p.c].push(p.no);
      }
      const veh = r => [D.mk[r[0]], D.md[r[1]], r[2], r[3], r[7]].filter(Boolean).join(' ');
      const groups = new Map(); D.v.forEach(r => { const k = vk(D.mk[r[0]], D.md[r[1]], r[2], r[3], D.fu[r[4]], r[5], r[6], r[7]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
      const drop = new Set();
      for (const [k, rows] of groups) {
        const w = want.get(k) || { o: [], a: [], f: [], c: [] };
        for (const c of 'oafc') {
          const col = VCOL[c], all = new Set(rows.flatMap(r => String(r[col] || '').split(' ').filter(Boolean)));
          rows.forEach((r, i) => {
            const cur = String(r[col] || '').split(' ').filter(Boolean);
            const next = cur.filter(pn => w[c].includes(pn)).concat(i === 0 ? w[c].filter(pn => !all.has(pn)) : []);
            if (next.join(' ') === cur.join(' ')) return;
            next.filter(pn => !cur.includes(pn)).forEach(pn => log(this.dir, pn, 'vehicles', { added: [veh(r)] }));
            cur.filter(pn => !next.includes(pn)).forEach(pn => log(this.dir, pn, 'vehicles', { removed: 1, vehicle: veh(r) }));
            if (col === 12 && r.length < 13) { while (r.length < 12) r.push(0); r.push(next.join(' ')); } else r[col] = next.join(' ');
          });
        }
        rows.forEach(r => { if (![8, 9, 10, 12].some(c => t(r[c]))) drop.add(r); });
      }
      if (drop.size) { R.vehiclesRemoved += drop.size; D.v = D.v.filter(r => !drop.has(r)); }
      const idx = (list, v) => { v = v || ''; let i = list.indexOf(v); if (i < 0) i = list.findIndex(x => low(x) === low(v)); if (i < 0) { i = list.length; list.push(v); } return i; };
      for (const [k, w] of want) {
        if (groups.has(k)) continue;
        if (![w.app.model, w.app.variant, w.app.engine_code, w.app.years].some(Boolean)) { notShown('Filter vehicles with only a make (the vehicle table lists models)'); continue; }
        const a = w.app, mkI = idx(D.mk, a.make.toUpperCase()), r = [mkI, idx(D.md, a.model.toUpperCase()), a.variant, a.engine_code, idx(D.fu, a.fuel), a.cc, a.kw, a.years, w.o.join(' '), w.a.join(' '), w.f.join(' '), 0];
        if (w.c.length) r.push(w.c.join(' '));
        let at = -1; D.v.forEach((x, i) => { if (x[0] === mkI) at = i; });
        D.v.splice(at < 0 ? D.v.length : at + 1, 0, r); R.vehiclesAdded++;
        [].concat(w.o, w.a, w.f, w.c).forEach(pn => log(this.dir, pn, 'vehicles', { added: [veh(r)] }));
      }
    }
    const cnt = {}; D.v.forEach(r => [8, 9, 10, 12].forEach(c => String(r[c] || '').split(' ').filter(Boolean).forEach(pn => { cnt[pn] = (cnt[pn] || 0) + 1; })));
    D.p.forEach(p => { if (p.n !== (cnt[p.no] || 0)) p.n = cnt[p.no] || 0; });
  },
});

// ---------- run every page
const onSite = new Set(), out = [], counts = {};
for (const A of PAGES) {
  const pg = new Page(A.dir), list = A.load(pg), before = list.length;
  const ctx = { replace(oldRows, newRows) { const i = list.indexOf(oldRows[0]); for (const r of oldRows) list.splice(list.indexOf(r), 1); list.splice(i, 0, ...newRows); } };
  const groups = new Map(); for (const it of list) { const pn = A.pn(it); if (!groups.has(pn)) groups.set(pn, []); groups.get(pn).push(it); }
  for (const [pn, rows] of groups) {
    onSite.add(pn);
    if (!active(pn)) {   // deleted in the database, or no longer Active
      R.partsRemoved.push(pn); log(A.dir, pn, 'removed part', { reason: DB[pn] ? 'status ' + DB[pn].status : 'deleted from the database' });
      rows.forEach(r => list.splice(list.indexOf(r), 1)); continue;
    }
    const db = get(pn);
    if (A.grouped) A.numbers(A.fields(rows, pn, db, ctx), pn, db);
    else for (const it of rows) { A.fields(it, pn, db); A.numbers(it, pn, db); }
  }
  for (const db of Object.values(DB)) {   // new parts
    if (!A.subs.includes(db.sub) || onSite.has(db.pn) || db.status !== 'Active') continue;
    const n0 = R.changes.length, items = A.create(db), key = A.sortKey || A.pn;
    for (const it of items) insertSorted(list, it, key);
    if (A.grouped) A.numbers(items, db.pn, db); else items.forEach(it => A.numbers(it, db.pn, db));
    R.changes.splice(n0); R.partsUpdated.delete(db.pn);
    onSite.add(db.pn); R.partsAdded.push(db.pn);
    log(A.dir, db.pn, 'new part', { description: db.desc, range: db.sub });
  }
  if (A.finish) A.finish();
  counts[A.dir] = [before, list.length];
  const src = pg.render(); if (src !== pg.src) out.push([pg.file, src]);
}
const noPage = Object.values(DB).filter(d => d.status === 'Active' && !SUB_PAGE[d.sub]);
for (const s of new Set(noPage.map(d => d.sub))) notShown('Parts in ranges without a website page (' + s + ')', noPage.filter(d => d.sub === s).length);

// ---------- part counts shown on the home page and on the range pages
const fmt = n => n.toLocaleString('en-US');
const HOME = path.join(ROOT, 'index.html');
let home = fs.readFileSync(HOME, 'utf8'); const home0 = home;
const totalOld = Object.values(counts).reduce((s, c) => s + c[0], 0), totalNew = Object.values(counts).reduce((s, c) => s + c[1], 0);
for (const [dir, [a, b]] of Object.entries(counts)) {
  if (a === b) continue;
  home = home.replace(new RegExp('(class="tile" href="/' + dir + '/"[^]*?<span>)' + fmt(a) + '( part numbers)'), '$1' + fmt(b) + '$2');
  const o = out.find(x => x[0].includes(path.sep + dir + path.sep)); if (!o) continue;
  for (const [x, y] of [['<b>' + fmt(a) + '</b><span>Lucas part numbers', '<b>' + fmt(b) + '</b><span>Lucas part numbers'], ['of ' + fmt(a) + ' parts', 'of ' + fmt(b) + ' parts'], ['<b id="factParts">' + fmt(a) + '</b>', '<b id="factParts">' + fmt(b) + '</b>']]) o[1] = o[1].split(x).join(y);
}
if (totalOld !== totalNew) home = home.split(fmt(totalOld) + ' Lucas part numbers').join(fmt(totalNew) + ' Lucas part numbers');
if (home !== home0) out.push([HOME, home]);

// ---------- safety, then write
const blocked = [];
if (R.numbersRemoved > LIMITS.numbers) blocked.push(R.numbersRemoved + ' numbers');
if (R.partsRemoved.length > LIMITS.parts) blocked.push(R.partsRemoved.length + ' parts');
if (R.vehiclesRemoved > LIMITS.vehicles) blocked.push(R.vehiclesRemoved + ' vehicles');
const report = {
  at: snap.at, written: false,
  blocked: blocked.length && !ALLOW ? 'This would remove ' + blocked.join(', ') + ' from the website at once, so nothing was published. If that is intended, run the publish job by hand with "allow removals".' : null,
  added: R.numbersAdded, removed: R.numbersRemoved,
  partsAdded: R.partsAdded.length, partsRemoved: R.partsRemoved.length, partsUpdated: R.partsUpdated.size,
  vehiclesAdded: R.vehiclesAdded, vehiclesRemoved: R.vehiclesRemoved,
  pages: R.pages, notShownOnPages: R.notShown,
  changes: R.changes.slice(0, 300), moreChanges: Math.max(0, R.changes.length - 300),
};
if (!report.blocked && !DRY) { for (const [f, s] of out) fs.writeFileSync(f, s); report.written = out.length > 0; }
fs.writeFileSync(process.env.PUBLISH_SUMMARY || 'publish-summary.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify(Object.assign({}, report, { changes: report.changes.slice(0, 40) }), null, 1).slice(0, 6000));
if (report.blocked) process.exit(3);
