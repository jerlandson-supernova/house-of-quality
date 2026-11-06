/* hoq-core.js — House of Quality: the formulas, the diagonalization and the file formats.
 * Pure functions, no DOM. Loaded by web/index.html as a classic script (window.HOQ) and by tools/hoq.js in node.
 * Every number the page and the spreadsheet show comes from here; docs/formulas.md explains each one. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HOQ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const REL_VALUES = [0, 1, 3, 9];                       // blank, weak, medium, strong
const ROOF_VALUES = ['', '++', '+', '−', '−−'];        // none, strong positive, positive, trade-off, strong trade-off
const DIRS = ['↑', '↓', '◎'];                          // larger is better, smaller is better, meet the target
const SYM = { 0: '', 1: '△', 3: '○', 9: '●' };
const WORD = { 0: 'none', 1: 'weak (1)', 3: 'medium (3)', 9: 'strong (9)' };
const ROOF_WORD = { '++': 'Strong positive: improving one strongly helps the other', '+': 'Positive: helps', '−': 'Trade-off: improving one tends to hurt the other', '−−': 'Strong trade-off' };
const DEFAULT_STATUS_SCALE = { 'To Do': 0, 'In Progress': 0.35, 'In Review': 0.6, 'Staging': 0.8, 'Done': 1 };
// One verdict scale everywhere: what the owner's own test said about an item. 'retested' holds the date of that test.
const TESTED_CLASSES = { verified: 'Verified', partial: 'Partial', fails: 'Fails', 'not built': 'Not built' };
// Older spellings still load: failed → fails silently; 'not retested' is no longer a verdict (the date in retested says when the test was) and is dropped with a warning.
const TESTED_ALIASES = { failed: 'fails', fail: 'fails', 'fails the bar': 'fails', 'not retested': '' };
/** A tested value as it should be stored: {value, dropped} where dropped is the original text when it was not kept. */
function testedValue(v) {
  const t = str(v).toLowerCase().trim();
  if (t === '' || t in TESTED_CLASSES) return { value: t, dropped: '' };
  if (t in TESTED_ALIASES) return { value: TESTED_ALIASES[t], dropped: TESTED_ALIASES[t] ? '' : t };
  return { value: '', dropped: t };
}

const num = (v, d) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
const str = v => (v === undefined || v === null) ? '' : String(v);
const BOM = '\uFEFF'; // put in front of a TSV or CSV file: Excel on Windows otherwise reads ↑ ↓ ◎ ≤ − in the local codepage
const truthy = v => v === true || /^(1|true|yes|y|gate|x)$/i.test(str(v).trim());

// ---------- the house: shape, defaults, validation ----------
function blank() {
  return { title: 'House of Quality', subtitle: '', meta: { date: '', author: '', todayLabel: 'today', scale: '1 poor to 5 excellent', notes: [], boardRead: '', boardSource: '' },
    needs: [], characteristics: [], relationships: {}, roof: {}, items: {}, statusScale: Object.assign({}, DEFAULT_STATUS_SCALE), blockNames: {}, narrative: {},
    revision: 0, provenance: {}, proposals: [], proposalSeq: 0 };
}

/** Take anything shaped like a house (the JSON file, an older field naming, a CSV import) and return
 *  {house, errors, warnings}: a clean house with every field present, ids unique, cells in {1,3,9}, roof keys canonical. */
function normalize(input) {
  const errors = [], warnings = [];
  const src = input || {};
  const h = blank();
  h.title = str(src.title) || h.title; h.subtitle = str(src.subtitle);
  h.meta = Object.assign(h.meta, src.meta || {});
  if (!Array.isArray(h.meta.notes)) h.meta.notes = [];
  h.meta.boardRead = isoDateTime(h.meta.boardRead); h.meta.boardSource = str(h.meta.boardSource);
  h.needs = (src.needs || src.whats || []).map((w, i) => ({
    id: str(w.id).trim() || 'W' + (i + 1), need: str(w.need || w.name || w.text), short: str(w.short) || str(w.need || w.name || w.text).slice(0, 48),
    source: str(w.source ?? w.src), importance: clamp(num(w.importance ?? w.imp, 3), 1, 5), today: clamp(num(w.today ?? w.now, 1), 1, 5),
    goal: clamp(num(w.goal, 5), 1, 5), links: str(w.links ?? w.link), why: str(w.why) }));
  h.characteristics = (src.characteristics || src.hows || []).map((c, j) => ({
    id: str(c.id).trim() || 'H' + (j + 1), name: str(c.name || c.characteristic || c.text), short: str(c.short) || str(c.name || c.characteristic || c.text).slice(0, 36),
    unit: str(c.unit), direction: DIRS.includes(c.direction || c.dir) ? (c.direction || c.dir) : dirFrom(c.direction || c.dir),
    target: str(c.target), targetShort: str(c.targetShort ?? c.tShort) || str(c.target).slice(0, 24),
    today: str(c.today), todayShort: str(c.todayShort ?? c.nShort) || str(c.today).slice(0, 24),
    links: str(c.links ?? c.link), difficulty: clamp(num(c.difficulty ?? c.diff, 3), 1, 5), gate: truthy(c.gate) }));
  // unique ids
  const seen = new Set();
  h.needs.forEach(w => { if (seen.has(w.id)) errors.push('Duplicate need id ' + w.id); seen.add(w.id); });
  const seenC = new Set();
  h.characteristics.forEach(c => { if (seenC.has(c.id)) errors.push('Duplicate characteristic id ' + c.id); seenC.add(c.id); if (seen.has(c.id)) errors.push('Id used by a need and a characteristic: ' + c.id); });
  if (!h.needs.length) errors.push('No needs (rows).');
  if (!h.characteristics.length) errors.push('No characteristics (columns).');
  // relationships
  const rel = src.relationships || src.rel || src.REL0 || {};
  h.relationships = {};
  h.needs.forEach(w => { h.relationships[w.id] = {}; });
  Object.keys(rel).forEach(wid => {
    if (!h.relationships[wid]) { warnings.push('Relationship row for an unknown need ' + wid + ' was dropped.'); return; }
    Object.keys(rel[wid] || {}).forEach(hid => {
      if (!seenC.has(hid)) { warnings.push('Relationship ' + wid + ' × ' + hid + ' names an unknown characteristic and was dropped.'); return; }
      const v = relValue(rel[wid][hid]);
      if (v === null) warnings.push('Relationship ' + wid + ' × ' + hid + ' = ' + rel[wid][hid] + ' is not 9, 3, 1 or blank and was dropped.');
      else if (v) h.relationships[wid][hid] = v;
    });
  });
  // roof, canonical by listed order
  const idx = {}; h.characteristics.forEach((c, j) => { idx[c.id] = j; });
  const canon = (a, b) => idx[a] < idx[b] ? a + '|' + b : b + '|' + a;
  h.roof = {};
  Object.keys(src.roof || src.ROOF0 || {}).forEach(k => {
    const [a, b] = k.split('|').map(s => s.trim());
    if (!(a in idx) || !(b in idx) || a === b) { warnings.push('Roof pair ' + k + ' names an unknown characteristic and was dropped.'); return; }
    const v = roofValue((src.roof || src.ROOF0)[k]);
    if (v === null) { warnings.push('Roof pair ' + k + ' has a value outside ++ + − −− and was dropped.'); return; }
    if (v) h.roof[canon(a, b)] = v;
  });
  // work items (optional)
  h.items = {};
  const items = src.items || {};
  (Array.isArray(items) ? items : Object.keys(items).map(k => Object.assign({ key: k }, items[k]))).forEach(it => {
    const key = str(it.key || it.id).trim(); if (!key) return;
    const tv = testedValue(it.tested);
    if (tv.dropped === 'not retested') warnings.push('Item ' + key + ': "not retested" is no longer a verdict and was left empty; record the date of the last test in retested.');
    else if (tv.dropped) warnings.push('Item ' + key + ': tested "' + tv.dropped + '" is not verified, partial, fails or not built and was left empty.');
    const retested = isoDate(it.retested);
    if (str(it.retested).trim() && !retested) warnings.push('Item ' + key + ': retested "' + str(it.retested).trim() + '" is not a date and was left empty.');
    h.items[key] = { title: str(it.title || it.summary), status: str(it.status).trim(), due: isoDate(it.due) || str(it.due).trim(), effort: str(it.effort ?? it.points), tested: tv.value, retested,
      updated: isoDateTime(it.updated), resolved: isoDateTime(it.resolved), priority: str(it.priority), sprint: str(it.sprint), note: str(it.note) };
  });
  h.statusScale = Object.keys(src.statusScale || {}).length ? mapNum(src.statusScale) : Object.assign({}, DEFAULT_STATUS_SCALE);
  Object.keys(h.items).forEach(k => { const s = h.items[k].status; if (s && !(s in h.statusScale)) { warnings.push('Item ' + k + ' has status "' + s + '" which is not in statusScale; it counts as 0 progress.'); } });
  h.blockNames = src.blockNames || {};
  h.narrative = src.narrative || {};
  if (Array.isArray(h.narrative.criticalPath)) h.narrative.criticalPath = h.narrative.criticalPath.map(x => Array.isArray(x) ? [str(x[0]), str(x[1])] : [str(x.item || x.key), str(x.text || x.why)]);
  // provenance (who set a value, with what evidence) and proposals awaiting a person's confirmation
  h.revision = Math.max(0, Math.floor(num(src.revision, 0)));
  h.proposalSeq = Math.max(0, Math.floor(num(src.proposalSeq, 0)));
  h.provenance = {};
  Object.keys(src.provenance || {}).forEach(k => { const p = src.provenance[k]; if (p && typeof p === 'object') h.provenance[k] = { value: p.value, by: str(p.by), confirmedBy: str(p.confirmedBy), when: str(p.when), note: str(p.note), evidence: str(p.evidence) }; });
  h.proposals = [];
  (Array.isArray(src.proposals) ? src.proposals : []).forEach(p => { const q = cleanProposal(h, p); if (q) h.proposals.push(q); else warnings.push('A proposal was dropped: ' + JSON.stringify(p).slice(0, 80)); });
  // empty rows / columns are allowed but worth a warning (Hauser and Clausing read them as a finding)
  h.needs.forEach(w => { if (!Object.keys(h.relationships[w.id]).length) warnings.push('Need ' + w.id + ' has no relationship: nothing in the house serves it.'); });
  h.characteristics.forEach(c => { if (!h.needs.some(w => h.relationships[w.id][c.id])) warnings.push('Characteristic ' + c.id + ' drives nothing.'); });
  return { house: h, errors, warnings };
}
function dirFrom(v) { const s = str(v).toLowerCase(); if (/down|less|lower|small|min|↓|-/.test(s)) return '↓'; if (/target|meet|nominal|◎|=/.test(s)) return '◎'; return '↑'; }
function relValue(v) { if (v === '' || v === null || v === undefined) return 0; const s = str(v).trim(); if (s === '') return 0; if (s === '●') return 9; if (s === '○') return 3; if (s === '△') return 1; const n = parseInt(s, 10); return REL_VALUES.includes(n) ? n : null; }
function roofValue(v) { const s = str(v).trim().replace(/--/g, '−−').replace(/^-$/, '−'); return ROOF_VALUES.includes(s) ? s : null; }
function mapNum(o) { const r = {}; Object.keys(o).forEach(k => { r[k] = Math.min(1, Math.max(0, num(o[k], 0))); }); return r; }

// ---------- the formulas (docs/formulas.md) ----------
/** needs and chars in the order you want the results in (the page passes its display order); rel = house.relationships.
 *  mode 'importance' weights each need by its importance; 'gap' by importance × (goal ÷ today). */
function compute(needs, chars, rel, opts) {
  opts = opts || {};
  const mode = opts.mode === 'gap' ? 'gap' : 'importance';
  const topN = opts.topN || 5;
  const wts = needs.map(w => mode === 'gap' ? w.importance * (w.goal / Math.max(1, w.today || 1)) : w.importance);
  const abs = chars.map(h => needs.reduce((s, w, i) => s + wts[i] * ((rel[w.id] || {})[h.id] || 0), 0));
  const total = abs.reduce((a, b) => a + b, 0) || 1;
  const gate = chars.map(h => !!h.gate);
  const rank = abs.map((v, j) => gate[j] ? 0 : 1 + abs.filter((x, k) => !gate[k] && x > v).length);
  const top = rank.map(r => r >= 1 && r <= topN);
  const nRanked = gate.filter(g => !g).length;
  const ratio = needs.map(w => w.goal / Math.max(1, w.today || 1));
  const adj = needs.map((w, i) => w.importance * ratio[i]);
  const adjT = adj.reduce((a, b) => a + b, 0) || 1;
  return { mode, wts, abs, total, pct: abs.map(a => a / total), rank, gate, top, nRanked, ratio, adj, adjPct: adj.map(a => a / adjT), max: Math.max(...abs, 1) };
}
const rankText = (C, j) => C.gate[j] ? 'gate' : 'rank ' + C.rank[j];

/** The room as a number matrix in listed order; use='strong' keeps only the 9s (QFD reads them as the structure). */
function relMatrix(house, use) {
  return house.needs.map(w => house.characteristics.map(h => { const v = (house.relationships[w.id] || {})[h.id] || 0; return use === 'strong' ? (v === 9 ? 9 : 0) : v; }));
}

/** Work-item keys named in a links field. "KAN-120, 62 to 68; L3CD-83" → KAN-120, KAN-62 … KAN-68, L3CD-83.
 *  A plain word is kept only when it is a key in house.items, so prose in the field ("design note") is ignored. */
function linksOf(text, items) {
  const out = [];
  str(text).split(';').forEach(seg => {
    // A full key sets the project for the bare numbers and ranges that follow it in the segment; another full key ("MUG-1 with KAN-2") switches it.
    const re = /(?<![\w.-])(?:([A-Za-z][\w.]*)-)?(\d+)(?:\s+to\s+(\d+))?(?![\w-])/g; let proj = '', t;
    while ((t = re.exec(seg))) {
      if (t[1]) proj = t[1]; else if (!proj) continue;
      const a = +t[2], b = t[3] ? +t[3] : 0;
      if (b >= a) for (let x = a; x <= b; x++) out.push(proj + '-' + x); else out.push(proj + '-' + a);
    }
    if (items) seg.split(',').map(s => s.trim()).forEach(tok => { if (tok && items[tok]) out.push(tok); });
  });
  return [...new Set(out)];
}

/** Each characteristic's weighted importance split evenly over the items it links to; needs' links are listed, not weighted. */
function itemShares(house, C, chars, needs) {
  chars = chars || house.characteristics; needs = needs || house.needs;
  const sh = {}, hows = {}, gate = {}, nds = {};
  chars.forEach((h, j) => { const t = linksOf(h.links, house.items); t.forEach(k => { sh[k] = (sh[k] || 0) + C.abs[j] / t.length; (hows[k] = hows[k] || []).push(h); if (h.gate) gate[k] = true; }); });
  needs.forEach(w => linksOf(w.links, house.items).forEach(k => { (nds[k] = nds[k] || []).push(w); }));
  const keys = [...new Set([...Object.keys(sh), ...Object.keys(nds)])].sort((a, b) => (sh[b] || 0) - (sh[a] || 0) || a.localeCompare(b, undefined, { numeric: true }));
  return { shares: sh, chars: hows, gate, needs: nds, keys, total: C.total };
}

/** Two progress measures. rightWall: importance-weighted (today − 1) ÷ (goal − 1) over the needs.
 *  statusWeighted: each characteristic's items scored by statusScale, weighted by the characteristic's share. */
function progress(house, C) {
  const impT = house.needs.reduce((s, w) => s + w.importance, 0) || 1;
  const rightWall = house.needs.reduce((s, w) => s + w.importance * Math.min(1, (Math.max(1, w.today) - 1) / Math.max(1, w.goal - 1)), 0) / impT;
  let jw = 0, jp = 0;
  house.characteristics.forEach((h, j) => { const t = linksOf(h.links, house.items).filter(k => house.items[k]); if (!t.length) return; jw += C.abs[j]; jp += C.abs[j] * t.reduce((s, k) => s + (house.statusScale[house.items[k].status] || 0), 0) / t.length; });
  const counts = {}; Object.values(house.items).forEach(it => { counts[it.status || '(none)'] = (counts[it.status || '(none)'] || 0) + 1; });
  const A = asOfDate(house); const asOf = A.date;
  const late = Object.keys(house.items).filter(k => { const it = house.items[k]; return it.due && it.due < asOf && (house.statusScale[it.status] || 0) < 1; });
  const effortAll = Object.values(house.items).reduce((s, it) => s + (num(it.effort, 0)), 0);
  const effortLeft = Object.values(house.items).filter(it => (house.statusScale[it.status] || 0) < 1).reduce((s, it) => s + num(it.effort, 0), 0);
  return { rightWall, statusWeighted: jw ? jp / jw : null, coverage: jw / (C.total || 1), counts, late, asOf, asOfSource: A.source, effortAll, effortLeft, itemCount: Object.keys(house.items).length };
}

// ---------- dates: the local calendar date is "today"; lateness is judged against the day the board was read ----------
const pad2 = n => String(n).padStart(2, '0');
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** The local calendar date of a Date (or anything Date accepts) as YYYY-MM-DD; '' when it is not a date. */
function localDate(d) { d = d instanceof Date ? d : new Date(d); return Number.isNaN(d.getTime()) ? '' : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
const todayLocal = () => localDate(new Date());
/** Parse a date or date-time text into a Date, or null. Accepts ISO forms (a zone like +0000 included) and Jira's export form
 *  "05/Nov/26 2:14 PM" (read as a local time, since the export carries no zone). */
function parseDate(s) {
  s = str(s).trim(); if (!s) return null;
  const j = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (j && MONTHS[j[2].toLowerCase()] !== undefined) {
    let y = +j[3]; if (y < 100) y += 2000; let hh = j[4] ? +j[4] : 0; const ap = j[7] ? j[7].toUpperCase() : '';
    if (ap === 'PM' && hh < 12) hh += 12; if (ap === 'AM' && hh === 12) hh = 0;
    return new Date(y, MONTHS[j[2].toLowerCase()], +j[1], hh, j[5] ? +j[5] : 0, j[6] ? +j[6] : 0);
  }
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(d.getTime()) ? null : d;
}
/** A calendar date as YYYY-MM-DD: a bare date stays as written; a date-time (ISO or Jira's export form) becomes its local date; '' when unreadable. */
function isoDate(s) {
  s = str(s).trim(); if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return s;
  const d = parseDate(s); return d ? localDate(d) : '';
}
/** An instant as an ISO string (toISOString); a bare YYYY-MM-DD stays a date; unreadable text is kept as typed, trimmed. */
function isoDateTime(s) {
  s = str(s).trim(); if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = parseDate(s); return d ? d.toISOString() : s;
}
/** The day "past due" is judged against, with where it came from: the day the board was read, else the data date, else today. */
function asOfDate(house) {
  const m = (house && house.meta) || {};
  if (m.boardRead && isoDate(m.boardRead)) return { date: isoDate(m.boardRead), source: 'board read' };
  if (m.date && isoDate(m.date)) return { date: isoDate(m.date), source: 'data date' };
  return { date: todayLocal(), source: 'today' };
}
/** Has the tracker changed the item since the owner last tested it? Needs both dates. */
const isStale = it => !!(it && it.updated && it.retested && isoDate(it.updated) > it.retested);
const daysBetween = (a, b) => { const A = isoDate(a), B = isoDate(b); if (!A || !B) return 0; const [y1, m1, d1] = A.split('-').map(Number), [y2, m2, d2] = B.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };

/** Board status read against the owner's own test verdict: is it really done? Returns [text, class] with class ok, warn, bad or mute. */
function reallyDone(house, status, tested) {
  const p = house.statusScale[status]; const done = p === 1, far = p !== undefined && p >= 0.8;
  if (!tested) return ['no test yet', 'mute'];
  if (done) { if (tested === 'verified') return ['holds', 'ok']; if (tested === 'partial') return ['done, open clauses', 'warn']; return ['overstated', 'bad']; }
  if (far) { if (tested === 'verified') return ['holds so far', 'ok']; if (tested === 'partial') return ['partly', 'warn']; if (tested === 'fails') return ['not yet', 'bad']; return ['overstated', 'bad']; }
  if (tested === 'verified') return ['understated', 'ok'];
  if (tested === 'fails') return ['not yet', 'bad'];
  return ['matches', 'mute'];
}
const MISMATCH_KIND = { 'overstated': 'overstated', 'done, open clauses': 'open clauses', 'partly': 'partly', 'not yet': 'not yet', 'understated': 'understated' };
const MISMATCH_ORDER = ['overstated', 'not yet', 'open clauses', 'partly', 'understated', 'stale'];

/** Everything the daily screen shows, as data: gates, the path, where the board and the tests disagree, what is overdue, the
 *  full table and the counts. C is compute() over the listed order. Pure: the page, the CLI and the server all read this. */
function boardFacts(house, C) {
  C = C || compute(house.needs, house.characteristics, house.relationships, {});
  const items = house.items || {}, scale = house.statusScale || {};
  const A = asOfDate(house); const asOf = A.date;
  const P = progress(house, C); const T = itemShares(house, C);
  const wgt = st => scale[st]; const isDone = st => wgt(st) === 1;
  const share = k => T.shares[k] ? T.shares[k] / (T.total || 1) : 0;
  const rd = it => reallyDone(house, it.status, it.tested);
  const isLate = it => !!(it.due && it.due < asOf && (wgt(it.status) || 0) < 1);
  const gates = house.characteristics.filter(h => h.gate).map(h => {
    const keys = linksOf(h.links, items).filter(k => items[k]);
    const list = keys.map(k => { const it = items[k]; const r = rd(it); return { key: k, title: it.title, status: it.status, weight: wgt(it.status) === undefined ? null : wgt(it.status), due: it.due, late: isLate(it), tested: it.tested, retested: it.retested, stale: isStale(it), verdict: r[0], verdictClass: r[1] }; });
    const state = !list.length ? 'no item' : list.every(x => x.weight === 1 && x.tested === 'verified') ? 'clear' : 'blocked';
    return { id: h.id, short: h.short || h.name, name: h.name, today: h.today, target: h.target, state, items: list };
  });
  const cp = (house.narrative && Array.isArray(house.narrative.criticalPath)) ? house.narrative.criticalPath : [];
  const openKey = k => !items[k] || !isDone(items[k].status);
  let path;
  if (cp.length) path = { source: 'narrative', steps: cp.map(([label, text]) => { const keys = linksOf(label, items); return { label: str(label), text: str(text), keys, open: keys.length ? keys.some(openKey) : true, share: keys.reduce((s, k) => s + share(k), 0) }; }) };
  else path = { source: 'shares', steps: T.keys.filter(k => openKey(k)).slice(0, 7).map(k => ({ label: k, text: (items[k] || {}).title || '', keys: [k], open: true, share: share(k) })) };
  path.firstOpen = path.steps.findIndex(s => s.open);
  const noItem = house.characteristics.map((h, j) => ({ h, j })).filter(x => !linksOf(x.h.links, items).length).map(x => ({ id: x.h.id, short: x.h.short || x.h.name, share: C.pct[x.j], links: x.h.links }));
  const rows = T.keys.map(k => { const it = items[k] || { title: '', status: '', due: '', effort: '', tested: '', retested: '', updated: '', note: '' }; const r = rd(it);
    return { key: k, known: !!items[k], title: it.title || '', share: share(k), serves: [...(T.chars[k] || []).map(h => ({ id: h.id, gate: !!h.gate })), ...(T.needs[k] || []).map(w => ({ id: w.id, need: true }))],
      status: it.status || '', weight: wgt(it.status) === undefined ? null : wgt(it.status), due: it.due || '', late: isLate(it), daysLate: isLate(it) ? daysBetween(it.due, asOf) : 0, effort: it.effort || '', tested: it.tested || '', testedLabel: TESTED_CLASSES[it.tested] || '',
      retested: it.retested || '', updated: it.updated || '', stale: isStale(it), verdict: r[0], verdictClass: r[1], note: it.note || '' }; });
  Object.keys(items).forEach(k => { if (!T.keys.includes(k)) { const it = items[k]; const r = rd(it); rows.push({ key: k, known: true, title: it.title, share: 0, serves: [], status: it.status, weight: wgt(it.status) === undefined ? null : wgt(it.status), due: it.due, late: isLate(it), daysLate: isLate(it) ? daysBetween(it.due, asOf) : 0, effort: it.effort, tested: it.tested, testedLabel: TESTED_CLASSES[it.tested] || '', retested: it.retested, updated: it.updated, stale: isStale(it), verdict: r[0], verdictClass: r[1], note: it.note }); } });
  const mismatch = rows.filter(r => r.known && (MISMATCH_KIND[r.verdict] || r.stale)).map(r => Object.assign({ kind: MISMATCH_KIND[r.verdict] || 'stale' }, r))
    .sort((a, b) => MISMATCH_ORDER.indexOf(a.kind) - MISMATCH_ORDER.indexOf(b.kind) || b.share - a.share || a.key.localeCompare(b.key, undefined, { numeric: true }));
  const overdue = rows.filter(r => r.known && r.late).sort((a, b) => a.due.localeCompare(b.due) || b.share - a.share);
  const known = rows.filter(r => r.known);
  const counts = { items: Object.keys(items).length, linked: T.keys.length, done: known.filter(r => r.weight === 1).length, doneVerified: known.filter(r => r.weight === 1 && r.tested === 'verified').length,
    doneOpen: known.filter(r => r.weight === 1 && r.tested === 'partial').length, overstated: known.filter(r => r.verdict === 'overstated').length, late: overdue.length, stale: known.filter(r => r.stale).length,
    noTest: known.filter(r => !r.tested).length, unknownStatus: [...new Set(known.filter(r => r.status && r.weight === null).map(r => r.status))], gatesClear: gates.filter(g => g.state === 'clear').length, gates: gates.length };
  return { asOf, asOfSource: A.source, board: { read: house.meta.boardRead || '', source: house.meta.boardSource || '' }, progress: P, shares: T, gates, path, noItem, mismatch, overdue, rows, counts };
}

/** boardFacts as text lines, for the report and the CLI. */
function boardText(house, F) {
  F = F || boardFacts(house);
  const L = [];
  L.push(`BOARD AGAINST TESTS · as of ${F.asOf} (${F.asOfSource})` + (F.board.source ? ` · statuses from ${F.board.source}${F.board.read ? ', read ' + F.board.read.replace('T', ' ').slice(0, 16) : ''}` : ' · statuses as typed in the file'));
  L.push(`  gates: ${F.counts.gatesClear} of ${F.counts.gates} clear` + (F.gates.length ? '' : ' (none marked)'));
  F.gates.forEach(g => L.push(`    ${g.id.padEnd(5)} ${g.state.padEnd(8)} ${g.short}` + (g.items.length ? ' · ' + g.items.map(x => `${x.key} ${x.status || '(no status)'}${x.tested ? ' / ' + TESTED_CLASSES[x.tested] : ' / no test'}${x.late ? ' / late' : ''}`).join(', ') : ' · no work item') + (g.today ? ` · today: ${g.today}` : '')));
  L.push(`  next (${F.path.source === 'narrative' ? 'the critical path in the file' : 'open items by share'}):`);
  F.path.steps.forEach((s, i) => L.push(`    ${i === F.path.firstOpen ? '→' : s.open ? ' ' : '✓'} ${s.label}${s.text ? ' · ' + s.text : ''}`));
  if (F.noItem.length) L.push('    nothing on the board covers: ' + F.noItem.map(x => `${x.id} ${x.short} (${pct(x.share)})`).join(', '));
  L.push('  board against tests:' + (F.mismatch.length ? '' : ' no disagreement'));
  F.mismatch.forEach(m => L.push(`    ${m.key.padEnd(10)} ${m.kind.padEnd(12)} ${(m.status || '(no status)').padEnd(12)} ${(TESTED_CLASSES[m.tested] || 'no test').padEnd(10)}${m.stale ? ' changed since the test' : ''}${m.retested ? ' · tested ' + m.retested : ''}  ${m.title}`));
  L.push('  overdue:' + (F.overdue.length ? '' : ' none'));
  F.overdue.forEach(o => L.push(`    ${o.key.padEnd(10)} due ${o.due} · ${o.daysLate} day${o.daysLate === 1 ? '' : 's'} late · ${o.status || '(no status)'}  ${o.title}`));
  L.push(`  ${F.counts.items} items · ${F.counts.done} done, ${F.counts.doneVerified} of them verified · ${F.counts.noTest} with no test · ${F.counts.stale} changed since the test` + (F.counts.unknownStatus.length ? ' · statuses not in the weights: ' + F.counts.unknownStatus.join(', ') : ''));
  return L;
}

// ---------- tracker exports: statuses come from the board, verdicts stay the owner's ----------
/** Column names (after normHeader) per field, for a tracker export. 'jira' is Jira's CSV export; 'items' is the house's own items.csv. */
const IMPORT_MAPPINGS = {
  jira: { key: 'issue_key', title: 'summary', status: 'status', due: 'due_date', updated: 'updated', resolved: 'resolved', effort: ['custom_field_(story_point_estimate)', 'custom_field_(story_points)', 'story_points'], sprint: 'sprint', priority: 'priority' },
  items: { key: 'key', title: 'title', status: 'status', due: 'due', effort: 'effort', updated: 'updated' },
};
const IMPORT_FIELDS = ['title', 'status', 'due', 'effort', 'updated', 'resolved', 'priority', 'sprint'];
const KEY_RE = /^[A-Za-z][\w.]*-\d+$/;
/** Merge a tracker export into the items: rows are records (header → value, as from records()); mapping names the columns;
 *  add says which unknown keys become items ('linked' = only keys a links field names, 'all', 'none'). Writes title, status, due,
 *  effort, updated, resolved, priority and sprint when the export has the column; never tested, retested or note. */
function importItems(house, rows, opts) {
  opts = opts || {};
  const mapping = typeof opts.mapping === 'object' && opts.mapping ? opts.mapping : IMPORT_MAPPINGS[opts.mapping || 'jira'] || IMPORT_MAPPINGS.jira;
  const cols = f => { const c = mapping[f]; return (Array.isArray(c) ? c : c ? [c] : []).map(normHeader); };
  const add = ['linked', 'all', 'none'].includes(opts.add) ? opts.add : 'linked';
  house.items = house.items || {};
  const linked = {}; [...house.characteristics, ...house.needs].forEach(x => linksOf(x.links, house.items).forEach(k => { (linked[k] = linked[k] || []).push(x.id); }));
  const out = { changes: [], added: [], unchanged: [], skipped: [], unknownStatuses: [], rows: rows.length, source: str(opts.source), readAt: '' };
  const keyCols = cols('key').length ? cols('key') : ['key'];
  rows.forEach((raw, i) => {
    const rec = {}; Object.keys(raw || {}).forEach(k => { const h = normHeader(k); const v = str(raw[k]); if (!(h in rec) || v.trim() !== '') rec[h] = v; });
    const key = (keyCols.map(c => str(rec[c]).trim()).find(Boolean) || '');
    if (!key) { out.skipped.push({ row: i + 1, why: 'no key in ' + keyCols.join('/') }); return; }
    let it = house.items[key]; const isNew = !it;
    if (isNew) {
      if (add === 'none' || (add === 'linked' && !linked[key])) { out.skipped.push({ row: i + 1, key, why: add === 'none' ? 'not an item of the house' : 'no links field names it' }); return; }
      it = { title: '', status: '', due: '', effort: '', tested: '', retested: '', updated: '', resolved: '', priority: '', sprint: '', note: '' };
    }
    let changed = false;
    IMPORT_FIELDS.forEach(f => {
      const cs = cols(f); if (!cs.length || !cs.some(c => c in rec)) return;
      let v = str(cs.map(c => rec[c]).find(x => str(x).trim() !== '') || '').trim();
      if (f === 'due') v = isoDate(v) || v; if (f === 'updated' || f === 'resolved') v = isoDateTime(v);
      const from = str(it[f]); if (from === v) return;
      if (!isNew) out.changes.push({ key, field: f, from, to: v }); it[f] = v; changed = true;
    });
    if (it.status && !(it.status in (house.statusScale || {})) && !out.unknownStatuses.includes(it.status)) out.unknownStatuses.push(it.status);
    if (isNew) { house.items[key] = it; out.added.push({ key, linkedFrom: linked[key] || [], title: it.title, status: it.status }); }
    else if (!changed) out.unchanged.push(key);
  });
  if (rows.length) { out.readAt = isoDateTime(opts.readAt) || nowIso(); house.meta.boardRead = out.readAt; house.meta.boardSource = str(opts.source) || 'tracker export'; }
  return out;
}
/** importItems' result as lines: key field old → new, + added, ? statuses not in the weights. */
function importText(r) {
  const L = [];
  const byKey = {}; r.changes.forEach(c => { (byKey[c.key] = byKey[c.key] || []).push(c); });
  Object.keys(byKey).forEach(k => L.push(`  ${k.padEnd(10)} ` + byKey[k].map(c => `${c.field} ${c.from || '(empty)'} → ${c.to || '(empty)'}`).join(' · ')));
  r.added.forEach(a => L.push(`  + ${a.key.padEnd(8)} added${a.linkedFrom.length ? ' (linked from ' + a.linkedFrom.join(', ') + ')' : ''}${a.status ? ' · ' + a.status : ''}${a.title ? ' · ' + a.title : ''}`));
  if (r.unknownStatuses.length) L.push('  ? statuses not in the weights (count as 0 progress): ' + r.unknownStatuses.join(', '));
  const sk = r.skipped.filter(s => s.key); if (sk.length) L.push(`  skipped ${sk.length} row${sk.length === 1 ? '' : 's'} the house does not link: ${sk.slice(0, 12).map(s => s.key).join(', ')}${sk.length > 12 ? ' …' : ''}`);
  const nk = r.skipped.filter(s => !s.key); if (nk.length) L.push(`  skipped ${nk.length} row${nk.length === 1 ? '' : 's'} with no key`);
  L.push(`  ${r.changes.length} change${r.changes.length === 1 ? '' : 's'} on ${Object.keys(byKey).length} item${Object.keys(byKey).length === 1 ? '' : 's'} · ${r.added.length} added · ${r.unchanged.length} unchanged · ${r.rows} row${r.rows === 1 ? '' : 's'} read` + (r.source ? ` · from ${r.source}` : ''));
  return L;
}

// ---------- TSV export: the version of record ----------
const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);
const pct = x => (Math.round(x * 1000) / 10).toFixed(1) + '%';
function toTSV(house, C, opts) {
  opts = opts || {};
  const needs = opts.needs || house.needs, chars = opts.chars || house.characteristics, rel = house.relationships;
  const q = s => str(s).replace(/[\t\n\r]+/g, ' ');
  const rows = [];
  rows.push([q(house.title), 'exported ' + todayLocal(), house.meta.date ? 'data as of ' + house.meta.date : '',
    'scoring mode: ' + (C.mode === 'gap' ? 'importance × gap: importance (1–5) × (goal ÷ today) × relationship (9/3/1)' : 'importance (1–5) × relationship (9/3/1)'),
    'order: ' + (opts.orderLabel || 'as listed'),
    'must-pass gates: ' + (chars.filter(h => h.gate).map(h => h.id).join(' ') || 'none') + (chars.some(h => h.gate) ? ' (not ranked)' : '')]);
  rows.push([]);
  rows.push(['', 'Direction', '', '', ...chars.map(h => h.direction)]);
  rows.push(['#', 'Need (WHAT)', 'Source', 'Importance', ...chars.map(h => h.id), 'Today', 'Goal', 'Ratio', 'Adjusted weight', 'Adjusted %', 'Links']);
  rows.push(['', '', '', '', ...chars.map(h => q(h.name))]);
  rows.push(['', '', '', 'Units', ...chars.map(h => q(h.unit))]);
  needs.forEach((w, i) => rows.push([w.id, q(w.need), q(w.source), w.importance, ...chars.map(h => (rel[w.id] || {})[h.id] || ''), w.today, w.goal, fmt1(C.ratio[i]), fmt1(C.adj[i]), pct(C.adjPct[i]), q(w.links)]));
  rows.push([]);
  rows.push(['', '', '', 'Target', ...chars.map(h => q(h.target))]);
  rows.push(['', '', '', 'Today', ...chars.map(h => q(h.today))]);
  rows.push(['', '', '', 'Weighted importance', ...chars.map((h, j) => fmt1(C.abs[j]))]);
  rows.push(['', '', '', 'Relative weight %', ...chars.map((h, j) => pct(C.pct[j]))]);
  rows.push(['', '', '', 'Must-pass gate', ...chars.map(h => h.gate ? 'gate' : '')]);
  rows.push(['', '', '', 'Rank (gates not ranked)', ...chars.map((h, j) => C.gate[j] ? 'gate' : C.rank[j])]);
  rows.push(['', '', '', 'Difficulty', ...chars.map(h => h.difficulty)]);
  rows.push(['', '', '', 'Links', ...chars.map(h => q(h.links))]);
  rows.push([]);
  rows.push(['Roof pairs', 'A', 'B', 'Correlation']);
  const byId = {}; chars.forEach(h => { byId[h.id] = h; });
  Object.keys(house.roof).filter(k => house.roof[k]).forEach(k => { const [a, b] = k.split('|'); rows.push(['', a + ' ' + q((byId[a] || {}).name), b + ' ' + q((byId[b] || {}).name), house.roof[k]]); });
  return rows.map(r => r.join('\t')).join('\n');
}

// ---------- CSV in and out ----------
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false; const s = str(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => str(x).trim() !== ''));
}
function csvField(v) { const s = str(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSVText(rows) { return rows.map(r => r.map(csvField).join(',')).join('\n') + '\n'; }
/** A header as a record key: trimmed, lower case, spaces and dashes as underscores ("Issue key" → issue_key, "Custom field (Story point estimate)" → custom_field_(story_point_estimate)). */
const normHeader = h => str(h).trim().toLowerCase().replace(/[\s-]+/g, '_');
/** Rows → records keyed by normHeader. A repeated header (Jira repeats Sprint and Labels) keeps the last non-empty value. */
function records(rows) { if (!rows.length) return []; const hdr = rows[0].map(normHeader); return rows.slice(1).map(r => { const o = {}; hdr.forEach((h, i) => { const v = r[i] === undefined ? '' : r[i]; if (!(h in o) || str(v).trim() !== '') o[h] = v; }); return o; }); }

const CSV_HEADERS = {
  needs: ['id', 'need', 'short', 'source', 'importance', 'today', 'goal', 'links', 'why'],
  characteristics: ['id', 'name', 'short', 'unit', 'direction', 'target', 'target_short', 'today', 'today_short', 'links', 'difficulty', 'gate'],
  roof: ['a', 'b', 'value'],
  items: ['key', 'title', 'status', 'due', 'effort', 'tested', 'retested', 'updated', 'note'],
};
/** Which of the five CSV files is this, or a tracker export ('items-tracker': Jira's CSV has an "Issue key" column)? By its first header row. */
function classifyCSV(rows, filename) {
  const hdr = (rows[0] || []).map(h => str(h).trim().toLowerCase());
  const has = k => hdr.includes(k);
  if (has('issue key') || has('issue_key')) return 'items-tracker';
  if (has('need') && has('importance')) return 'needs';
  if (has('name') && has('unit')) return 'characteristics';
  if (hdr[0] === 'a' && hdr[1] === 'b') return 'roof';
  if (has('key') && (has('status') || has('title'))) return 'items';
  if (hdr.length > 1 && hdr.slice(1).every(h => /^[a-z][\w.]*-?\d*$/i.test(h))) return 'matrix';
  const f = str(filename).toLowerCase();
  if (/need|what/.test(f)) return 'needs'; if (/how|char/.test(f)) return 'characteristics'; if (/roof/.test(f)) return 'roof'; if (/jira|tracker|export/.test(f)) return 'items-tracker'; if (/item|ticket|work/.test(f)) return 'items'; if (/matrix|rel|room/.test(f)) return 'matrix';
  return null;
}
/** Build a house from parsed CSV tables: {needs, characteristics, matrix, roof, items, 'items-tracker'} (rows arrays). matrix: header = characteristic ids,
 *  first column = need id. items.csv replaces the items (it carries the verdicts); a tracker export is merged with importItems after that
 *  (opts.source, opts.readAt, opts.add name the source, the read time and which new keys to add) and the result is returned as `import`. */
function fromCSV(tables, base, opts) {
  opts = opts || {};
  const h = Object.assign(blank(), base || {});
  if (tables.needs) h.needs = records(tables.needs);
  if (tables.characteristics) h.characteristics = records(tables.characteristics).map(c => Object.assign(c, { targetShort: c.target_short, todayShort: c.today_short }));
  if (tables.matrix) {
    const hdr = tables.matrix[0].slice(1).map(x => str(x).trim());
    h.relationships = {};
    tables.matrix.slice(1).forEach(r => { const wid = str(r[0]).trim(); if (!wid) return; h.relationships[wid] = {}; hdr.forEach((hid, j) => { const v = relValue(r[j + 1]); if (v) h.relationships[wid][hid] = v; }); });
  }
  if (tables.roof) { h.roof = {}; records(tables.roof).forEach(r => { if (r.a && r.b) h.roof[str(r.a).trim() + '|' + str(r.b).trim()] = r.value; }); }
  if (tables.items) { h.items = records(tables.items); }
  let r = normalize(h);
  if (tables['items-tracker'] && !r.errors.length) {
    const imp = importItems(r.house, records(tables['items-tracker']), { mapping: opts.mapping || 'jira', add: opts.add, source: opts.source || 'CSV export', readAt: opts.readAt });
    const r2 = normalize(r.house); r2.warnings = [...new Set([...r.warnings, ...r2.warnings])]; r2.import = imp; r = r2;
  }
  return r;
}
/** The house as the five CSV tables (text), for download or for a repo. */
function toCSV(house) {
  const out = {};
  out['needs.csv'] = toCSVText([CSV_HEADERS.needs, ...house.needs.map(w => [w.id, w.need, w.short, w.source, w.importance, w.today, w.goal, w.links, w.why])]);
  out['characteristics.csv'] = toCSVText([CSV_HEADERS.characteristics, ...house.characteristics.map(c => [c.id, c.name, c.short, c.unit, c.direction, c.target, c.targetShort, c.today, c.todayShort, c.links, c.difficulty, c.gate ? 'yes' : ''])]);
  out['matrix.csv'] = toCSVText([['need', ...house.characteristics.map(c => c.id)], ...house.needs.map(w => [w.id, ...house.characteristics.map(c => (house.relationships[w.id] || {})[c.id] || '')])]);
  out['roof.csv'] = toCSVText([CSV_HEADERS.roof, ...Object.keys(house.roof).map(k => [...k.split('|'), house.roof[k]])]);
  out['items.csv'] = toCSVText([CSV_HEADERS.items, ...Object.keys(house.items).map(k => { const it = house.items[k]; return [k, it.title, it.status, it.due, it.effort, it.tested, it.retested, it.updated, it.note]; })]);
  return out;
}

// ---------- a plain-text report (the CLI) ----------
function report(house, opts) {
  opts = opts || {};
  const C = compute(house.needs, house.characteristics, house.relationships, { mode: opts.mode });
  const L = [];
  L.push(house.title + (house.meta.date ? ' · as of ' + house.meta.date : ''));
  L.push(`${house.needs.length} needs × ${house.characteristics.length} characteristics · ${house.characteristics.filter(c => c.gate).length} gates · weighting by ${C.mode}`);
  L.push('');
  L.push('CHARACTERISTICS BY WEIGHTED IMPORTANCE');
  [...house.characteristics.keys()].sort((a, b) => C.abs[b] - C.abs[a]).forEach(j => { const h = house.characteristics[j]; L.push(`  ${h.id.padEnd(6)} ${fmt1(C.abs[j]).padStart(7)}  ${pct(C.pct[j]).padStart(6)}  ${(C.gate[j] ? 'gate' : '#' + C.rank[j]).padEnd(5)} ${h.short}`); });
  L.push('');
  L.push('NEEDS: IMPORTANCE, TODAY → GOAL, GAP SHARE');
  house.needs.forEach((w, i) => L.push(`  ${w.id.padEnd(6)} imp ${w.importance}  ${w.today}→${w.goal}  ratio ${fmt1(C.ratio[i])}  gap ${pct(C.adjPct[i]).padStart(6)}  ${w.short}`));
  const mat = relMatrix(house, 'all');
  if (house.needs.length > 1 && house.characteristics.length > 1) {
    const r = diagonalize(mat, { kMax: opts.kMax || 8, k: opts.k || 0 });
    L.push('');
    L.push(`DIAGONAL ORDER · ${r.k} blocks (Q = ${r.after.Q.toFixed(2)}) · in-block ${Math.round(r.after.inBlock * 100)}% (was ${Math.round(r.before.inBlock * 100)}%) · mean distance ${(r.after.meanDist * 100).toFixed(1)}% (was ${(r.before.meanDist * 100).toFixed(1)}%)`);
    r.blocks.rowCuts.forEach((a0, bi) => { const a1 = r.blocks.rowCuts[bi + 1] ?? r.n, b0 = r.blocks.colCuts[bi], b1 = r.blocks.colCuts[bi + 1] ?? r.m;
      L.push(`  B${bi + 1}: ${r.rows.slice(a0, a1).map(i => house.needs[i].id).join(' ')}  ×  ${r.cols.slice(b0, b1).map(j => house.characteristics[j].id).join(' ')}`); });
    L.push(`  coupling, strong only: ${r.strong.verdict} · all levels: ${r.all.verdict} (${r.all.above.length} ties one way, ${r.all.below.length} the other)`);
  }
  const P = progress(house, C);
  L.push('');
  L.push(`PROGRESS · right wall ${Math.round(P.rightWall * 100)}%` + (P.statusWeighted !== null ? ` · items by status ${Math.round(P.statusWeighted * 100)}% over ${Math.round(P.coverage * 100)}% of the weight` : '') + (P.itemCount ? ` · ${P.itemCount} items, ${P.late.length} past due` : ''));
  if (P.itemCount) { const T = itemShares(house, C); L.push('ITEMS BY SHARE OF THE HOUSE'); T.keys.forEach(k => { const it = house.items[k] || {}; L.push(`  ${k.padEnd(10)} ${(T.shares[k] ? pct(T.shares[k] / T.total) : '—').padStart(6)}  ${(it.status || '').padEnd(12)} ${it.due ? 'due ' + it.due : ''}  ${it.title || ''}`); });
    L.push(''); boardText(house, boardFacts(house, C)).forEach(l => L.push(l)); }
  return L.join('\n');
}

// ---------- provenance, proposals, the next cells, the Markdown report ----------
const nowIso = () => new Date().toISOString();
const PROPOSAL_KINDS = ['cell', 'roof', 'importance', 'today', 'goal', 'need', 'characteristic'];
/** The provenance key for a value: cell:W1|H2, roof:H1|H2 (canonical), importance:W1, today:W1, goal:W1. */
function provKey(house, kind, a, b) {
  if (kind === 'cell') return 'cell:' + a + '|' + b;
  if (kind === 'roof') { const idx = {}; house.characteristics.forEach((h, j) => { idx[h.id] = j; }); return 'roof:' + (idx[a] < idx[b] ? a + '|' + b : b + '|' + a); }
  return kind + ':' + a;
}
function cleanProposal(house, p) {
  if (!p || !PROPOSAL_KINDS.includes(p.kind)) return null;
  const q = { id: str(p.id), kind: p.kind, by: str(p.by), when: str(p.when) || nowIso(), note: str(p.note), evidence: str(p.evidence) };
  if (p.kind === 'cell') { if (!house.needs.some(w => w.id === p.need) || !house.characteristics.some(h => h.id === p.characteristic)) return null; const v = relValue(p.value); if (v === null) return null; q.need = p.need; q.characteristic = p.characteristic; q.value = v; }
  else if (p.kind === 'roof') { if (!house.characteristics.some(h => h.id === p.a) || !house.characteristics.some(h => h.id === p.b) || p.a === p.b) return null; const v = roofValue(p.value); if (v === null) return null; q.a = p.a; q.b = p.b; q.value = v; }
  else if (p.kind === 'need' || p.kind === 'characteristic') { const f = p.fields && typeof p.fields === 'object' ? p.fields : {}; const text = str(f.need || f.name || f.text || p.value); if (!text) return null; q.fields = Object.assign({}, f); q.value = text; if (f.id && (house.needs.some(w => w.id === f.id) || house.characteristics.some(h => h.id === f.id))) return null; }
  else { if (!house.needs.some(w => w.id === p.need)) return null; const v = num(p.value, NaN); if (!(v >= 1 && v <= 5)) return null; q.need = p.need; q.value = clamp(v, 1, 5); }
  return q;
}
/** Record a value someone set directly (a person on the page, or an agent allowed to write): who, when, why, with what evidence. */
function setProvenance(house, kind, a, b, value, meta) {
  house.provenance = house.provenance || {};
  house.provenance[provKey(house, kind, a, b)] = { value, by: str(meta && meta.by), confirmedBy: str(meta && meta.confirmedBy), when: str(meta && meta.when) || nowIso(), note: str(meta && meta.note), evidence: str(meta && meta.evidence) };
}
/** An agent suggests a value; it counts in no number until a person confirms it. Replaces an earlier proposal by the same actor for the same target. */
function propose(house, p) {
  const q = cleanProposal(house, Object.assign({}, p, { id: '' }));
  if (!q) return { error: 'Not a valid proposal: kind must be one of ' + PROPOSAL_KINDS.join(', ') + ', the ids must exist, and the value must be 9/3/1/0, a roof value, or 1 to 5.' };
  house.proposals = house.proposals || [];
  const target = targetOf(house, q);
  const i = house.proposals.findIndex(x => targetOf(house, x) === target && x.by === q.by);
  house.proposalSeq = (house.proposalSeq || 0) + 1; q.id = 'p' + house.proposalSeq;
  if (i >= 0) house.proposals[i] = q; else house.proposals.push(q);
  return { proposal: q, replaced: i >= 0 };
}
const targetOf = (house, q) => q.kind === 'cell' ? provKey(house, 'cell', q.need, q.characteristic) : q.kind === 'roof' ? provKey(house, 'roof', q.a, q.b) : (q.kind === 'need' || q.kind === 'characteristic') ? q.kind + ':' + str(q.value).toLowerCase().trim() : q.kind + ':' + q.need;
const describeProposal = q => q.kind === 'cell' ? `${q.need} × ${q.characteristic} = ${q.value || 'blank'}` : q.kind === 'roof' ? `roof ${q.a} ${q.value || 'none'} ${q.b}` : q.kind === 'need' ? `new need: ${q.value}` : q.kind === 'characteristic' ? `new characteristic: ${q.value}${q.fields && q.fields.unit ? ' (' + q.fields.unit + ')' : ''}` : `${q.need} ${q.kind} = ${q.value}`;
const nextFreeId = (house, prefix) => { let n = (prefix === 'W' ? house.needs : house.characteristics).length + 1; while (house.needs.some(x => x.id === prefix + n) || house.characteristics.some(x => x.id === prefix + n)) n++; return prefix + n; };
/** A person confirms a proposal: the value is applied and the provenance records both who proposed and who confirmed. */
function confirmProposal(house, id, confirmedBy) {
  const i = (house.proposals || []).findIndex(x => x.id === id); if (i < 0) return { error: 'No proposal ' + id };
  const q = house.proposals[i];
  const out = { applied: q };
  let a = q.need, b = null;
  if (q.kind === 'need' || q.kind === 'characteristic') {
    // A whole row or column: the fields are normalized like a loaded file. The text may have arrived as `value` alone.
    const f = Object.assign({}, q.fields || {}); if (!f.id) f.id = nextFreeId(house, q.kind === 'need' ? 'W' : 'H');
    if (q.kind === 'need' && !str(f.need)) f.need = q.value; if (q.kind === 'characteristic' && !str(f.name)) f.name = q.value;
    const tmp = normalize({ needs: q.kind === 'need' ? [f] : [{ id: 'W1', need: 'x' }], characteristics: q.kind === 'characteristic' ? [f] : [{ id: 'H1', name: 'x' }] }).house;
    const row = q.kind === 'need' ? tmp.needs[0] : tmp.characteristics[0];
    if (q.kind === 'need') {
      house.needs.push(row); house.relationships[row.id] = {};
      // Importance, today and goal belong to the stakeholder: a default is a number nobody gave, so the caller is told.
      const missing = ['importance', 'today', 'goal'].filter(k => f[k] === undefined || f[k] === null || String(f[k]).trim() === '');
      if (missing.length) out.warning = `${row.id}: ${missing.join(', ')} not given, defaulted to ${missing.map(k => row[k]).join(', ')}; ask the stakeholder and set ${missing.length > 1 ? 'them' : 'it'}, naming who gave ${missing.length > 1 ? 'them' : 'it'}.`;
    } else house.characteristics.push(row);
    out.added = row; a = row.id;
  }
  else if (q.kind === 'cell') { house.relationships[q.need] = house.relationships[q.need] || {}; if (q.value) house.relationships[q.need][q.characteristic] = q.value; else delete house.relationships[q.need][q.characteristic]; b = q.characteristic; }
  else if (q.kind === 'roof') { const k = provKey(house, 'roof', q.a, q.b).slice(5); if (q.value) house.roof[k] = q.value; else delete house.roof[k]; a = q.a; b = q.b; }
  else { const w = house.needs.find(x => x.id === q.need); w[q.kind] = q.value; }
  setProvenance(house, q.kind, a, b, q.value, { by: q.by, confirmedBy: confirmedBy, note: q.note, evidence: q.evidence });
  const target = targetOf(house, q);
  out.dropped = house.proposals.filter(x => x.id !== id && targetOf(house, x) === target).map(x => x.id);
  house.proposals = house.proposals.filter(x => x.id !== id && targetOf(house, x) !== target);
  return out;
}
function rejectProposal(house, id) {
  const i = (house.proposals || []).findIndex(x => x.id === id); if (i < 0) return { error: 'No proposal ' + id };
  const [q] = house.proposals.splice(i, 1); return { rejected: q };
}
/** The empty cells worth looking at next. Most cells of a good house stay blank, so this ranks the structural gaps:
 *  needs nothing serves, needs with no strong driver, characteristics driving nothing, then weight. */
function nextCells(house, limit) {
  limit = limit || 10;
  const C = compute(house.needs, house.characteristics, house.relationships, {});
  const pending = new Set((house.proposals || []).filter(p => p.kind === 'cell').map(p => p.need + '|' + p.characteristic));
  const colEmpty = house.characteristics.map(h => !house.needs.some(w => (house.relationships[w.id] || {})[h.id]));
  const out = [], unaddressed = [], noStrong = [];
  house.needs.forEach(w => {
    const row = house.relationships[w.id] || {}; const vals = Object.values(row);
    const none = !vals.some(v => v), weak = !vals.some(v => v === 9);
    if (none) unaddressed.push(w.id); else if (weak) noStrong.push(w.id);
    house.characteristics.forEach((h, j) => {
      if (row[h.id] || pending.has(w.id + '|' + h.id)) return;
      let score = w.importance * (none ? 2 : weak ? 1.5 : 0.5) * (1 + C.pct[j]);
      const why = []; if (none) why.push(w.id + ' has no relationship yet'); else if (weak) why.push(w.id + ' has no strong (9) driver');
      if (colEmpty[j]) { score *= 1.5; why.push(h.id + ' drives nothing yet'); }
      if (h.gate) { score *= 1.2; why.push(h.id + ' is a gate: decide its cells deliberately'); }
      out.push({ need: w.id, needShort: w.short, characteristic: h.id, characteristicShort: h.short, score: Math.round(score * 100) / 100, why: why.join('; ') || 'an empty cell between a weighted need and a weighted characteristic; probably right to leave blank' });
    });
  });
  out.sort((a, b) => b.score - a.score || a.need.localeCompare(b.need, undefined, { numeric: true }));
  return { cells: out.slice(0, limit), pendingProposals: (house.proposals || []).length, unaddressedNeeds: unaddressed, needsWithNoStrongDriver: noStrong, characteristicsDrivingNothing: house.characteristics.filter((h, j) => colEmpty[j]).map(h => h.id) };
}
/** The house as a Markdown report: for an agent to read, a wiki, a pull request, a message. */
function toMarkdown(house, opts) {
  opts = opts || {};
  const C = compute(house.needs, house.characteristics, house.relationships, { mode: opts.mode });
  const sym = opts.symbols === false ? v => (v ? String(v) : '') : v => SYM[v] || '';
  const q = v => str(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const L = [];
  L.push('# ' + house.title);
  if (house.subtitle) L.push('', house.subtitle);
  L.push('', '_' + [house.meta.date ? 'data as of ' + house.meta.date : '', house.meta.author ? 'by ' + house.meta.author : '', `${house.needs.length} needs × ${house.characteristics.length} characteristics`, `${house.characteristics.filter(h => h.gate).length} must-pass gates`, 'weighting by ' + C.mode, 'revision ' + (house.revision || 0), 'written ' + nowIso().slice(0, 10)].filter(Boolean).join(' · ') + '_');
  const top = [...house.characteristics.keys()].filter(j => !C.gate[j]).sort((a, b) => C.abs[b] - C.abs[a]).slice(0, 5);
  const P = progress(house, C);
  L.push('', '## Summary', '');
  L.push('- Top five characteristics: ' + top.map(j => `${house.characteristics[j].id} ${house.characteristics[j].short} (${pct(C.pct[j])})`).join(', ') + '.');
  const gates = house.characteristics.filter(h => h.gate); if (gates.length) L.push('- Must-pass gates, kept out of the rank: ' + gates.map(h => `${h.id} ${h.short}`).join(', ') + '.');
  L.push(`- Right wall: ${Math.round(P.rightWall * 100)}% of the way from poor to goal, importance-weighted.` + (P.statusWeighted !== null ? ` Work items by status: ${Math.round(P.statusWeighted * 100)}% over ${Math.round(P.coverage * 100)}% of the weight.` : ''));
  if ((house.proposals || []).length) L.push(`- ${house.proposals.length} proposal${house.proposals.length === 1 ? '' : 's'} awaiting a person's confirmation (counted in no number above).`);
  L.push('', '## Needs (rows)', '', '| # | Need | Source | Imp. | Today | Goal | Ratio | Gap % | Links |', '|---|---|---|---|---|---|---|---|---|');
  house.needs.forEach((w, i) => L.push(`| ${w.id} | ${q(w.need)} | ${q(w.source)} | ${w.importance} | ${w.today} | ${w.goal} | ${fmt1(C.ratio[i])} | ${pct(C.adjPct[i])} | ${q(w.links)} |`));
  L.push('', '## Characteristics (columns)', '', '| # | Characteristic | Unit | Dir. | Target | Today | Weight | % | Rank | Gate | Diff. | Links |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  house.characteristics.forEach((h, j) => L.push(`| ${h.id} | ${q(h.name)} | ${q(h.unit)} | ${h.direction} | ${q(h.target)} | ${q(h.today)} | ${fmtNum(C.abs[j])} | ${pct(C.pct[j])} | ${C.gate[j] ? 'gate' : C.rank[j]} | ${h.gate ? 'yes' : ''} | ${h.difficulty} | ${q(h.links)} |`));
  L.push('', '## The room', '', '● 9 strong · ○ 3 medium · △ 1 weak', '', '| | ' + house.characteristics.map(h => h.id).join(' | ') + ' |', '|---|' + house.characteristics.map(() => ':-:').join('|') + '|');
  house.needs.forEach(w => L.push(`| ${w.id} ${q(w.short)} | ` + house.characteristics.map(h => sym((house.relationships[w.id] || {})[h.id] || 0)).join(' | ') + ' |'));
  const roofKeys = Object.keys(house.roof).filter(k => house.roof[k]);
  L.push('', '## Roof', '');
  if (roofKeys.length) { const by = {}; house.characteristics.forEach(h => { by[h.id] = h; }); roofKeys.forEach(k => { const [a, b] = k.split('|'); L.push(`- ${a} ${house.roof[k]} ${b}: ${q((by[a] || {}).short)} and ${q((by[b] || {}).short)}. ${ROOF_WORD[house.roof[k]] || ''}`); }); }
  else L.push('No roof pairs set.');
  if (house.needs.length > 1 && house.characteristics.length > 1) {
    const r = diagonalize(relMatrix(house, 'all'), { kMax: 8 });
    const W = i => house.needs[i].id, X = j => house.characteristics[j].id;
    L.push('', '## Diagonal: blocks and coupling', '', `${r.k} blocks (modularity Q = ${r.after.Q.toFixed(2)}); ${Math.round(r.after.inBlock * 100)}% of the relationships inside the blocks (${Math.round(r.before.inBlock * 100)}% as listed).`, '');
    r.blocks.rowCuts.forEach((a0, bi) => L.push(`- B${bi + 1}: ${r.rows.slice(a0, r.blocks.rowCuts[bi + 1] ?? r.n).map(W).join(', ')} × ${r.cols.slice(r.blocks.colCuts[bi], r.blocks.colCuts[bi + 1] ?? r.m).map(X).join(', ')}`));
    L.push('', `Coupling, strong relationships only: **${r.strong.verdict}**. Counting every level: **${r.all.verdict}**` + (r.all.verdict === 'coupled' ? ` (${r.all.above.length} ties one way, ${r.all.below.length} the other; ties to cut: ${r.all.cut.map(t => W(t.i) + ' ← ' + X(t.j)).join(', ')}).` : '.'));
  }
  const keys = Object.keys(house.items);
  if (keys.length) {
    const T = itemShares(house, C);
    const F = boardFacts(house, C);
    L.push('', '## Work items', '', '| Key | Title | Share | Serves | Status | Due | Effort | Tested | Retested on | Changed since | Really done? | Note |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    F.rows.forEach(r => L.push(`| ${r.key} | ${q(r.title)} | ${r.share ? pct(r.share) : '—'} | ${r.serves.map(s => s.id + (s.gate ? ' (gate)' : '')).join(', ')} | ${q(r.status)} | ${q(r.due)}${r.late ? ' (late)' : ''} | ${q(r.effort)} | ${r.testedLabel || (r.known ? 'no test' : '')} | ${q(r.retested)} | ${r.stale ? 'yes, ' + q(isoDate(r.updated)) : (r.updated ? 'no' : '')} | ${r.verdict} | ${q(r.note)} |`));
    L.push('', '### Board against tests', '', `- As of ${F.asOf} (${F.asOfSource}); statuses ${F.board.source ? 'from ' + q(F.board.source) + (F.board.read ? ', read ' + q(F.board.read.replace('T', ' ').slice(0, 16)) : '') : 'as typed in the file'}.`);
    L.push(`- Gates: ${F.counts.gatesClear} of ${F.counts.gates} clear` + (F.gates.length ? ': ' + F.gates.map(g => `${g.id} ${g.state}` + (g.items.length ? ' (' + g.items.map(x => `${x.key} ${x.status || 'no status'} / ${TESTED_CLASSES[x.tested] || 'no test'}`).join(', ') + ')' : ' (no work item)')).join('; ') : '') + '.');
    L.push('- Where the board and the tests disagree: ' + (F.mismatch.length ? F.mismatch.map(m => `${m.key} ${m.kind} (${m.status || 'no status'} / ${TESTED_CLASSES[m.tested] || 'no test'}${m.stale ? ', changed since the test' : ''})`).join('; ') : 'nowhere') + '.');
    L.push('- Past due and not done: ' + (F.overdue.length ? F.overdue.map(o => `${o.key} (due ${o.due}, ${o.daysLate} day${o.daysLate === 1 ? '' : 's'})`).join(', ') : 'none') + '.');
    if (F.noItem.length) L.push('- Characteristics with no work item: ' + F.noItem.map(x => x.id).join(', ') + '.');
  }
  if ((house.proposals || []).length) {
    L.push('', '## Proposals awaiting confirmation', '', '| Id | What | By | When | Note | Evidence |', '|---|---|---|---|---|---|');
    house.proposals.forEach(p => L.push(`| ${p.id} | ${q(describeProposal(p))} | ${q(p.by)} | ${q(p.when.slice(0, 16))} | ${q(p.note)} | ${q(p.evidence)} |`));
  }
  const N = nextCells(house, 5);
  L.push('', '## Findings', '');
  L.push('- Needs with no relationship: ' + (N.unaddressedNeeds.join(', ') || 'none') + '.');
  L.push('- Needs with no strong driver: ' + (N.needsWithNoStrongDriver.join(', ') || 'none') + '.');
  L.push('- Characteristics driving nothing: ' + (N.characteristicsDrivingNothing.join(', ') || 'none') + '.');
  if (N.cells.length && (N.unaddressedNeeds.length || N.needsWithNoStrongDriver.length || N.characteristicsDrivingNothing.length)) L.push('- Cells to look at next: ' + N.cells.map(c => `${c.need} × ${c.characteristic} (${c.why})`).join('; ') + '.');
  const provKeys = Object.keys(house.provenance || {});
  if (provKeys.length) {
    L.push('', '## Provenance', '', `${provKeys.length} value${provKeys.length === 1 ? '' : 's'} with a recorded source.`);
    if (provKeys.length <= 80) { L.push('', '| Value | Set to | By | Confirmed by | When | Note | Evidence |', '|---|---|---|---|---|---|---|'); provKeys.forEach(k => { const p = house.provenance[k]; L.push(`| ${k} | ${q(p.value)} | ${q(p.by)} | ${q(p.confirmedBy)} | ${q(str(p.when).slice(0, 16))} | ${q(p.note)} | ${q(p.evidence)} |`); }); }
  }
  if (house.meta.notes && house.meta.notes.length) { L.push('', '## Notes', ''); house.meta.notes.forEach(x => L.push(`- **${q(x.term)}**: ${q(x.text)}`)); }
  return L.join('\n') + '\n';
}

// ---------- drawing: the house as an SVG, from a house object (no DOM, so node can write the file) ----------
const xmlEsc = s => str(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Rows and columns that take part in at least one relationship (JSqfd's "reduce" option). Returns index lists. */
function reduceLists(house) {
  const rows = house.needs.map((w, i) => i).filter(i => Object.values(house.relationships[house.needs[i].id] || {}).some(v => v));
  const cols = house.characteristics.map((h, j) => j).filter(j => house.needs.some(w => (house.relationships[w.id] || {})[house.characteristics[j].id]));
  return { rows, cols };
}
/** Draw the house. opts: reduce (hide rows and columns with no relationship), mode ('importance' | 'gap'), symbols (true: ● ○ △, false: 9 3 1),
 *  roof (default true), cell (px, default 28), title (default true), rows/cols (index lists for a custom order). Returns the SVG as a string. */
function toSVG(house, opts) {
  opts = opts || {};
  const C = compute(house.needs, house.characteristics, house.relationships, { mode: opts.mode });
  let rows = opts.rows || house.needs.map((w, i) => i), cols = opts.cols || house.characteristics.map((h, j) => j);
  if (opts.reduce) { const r = reduceLists(house); const rs = new Set(r.rows), cs = new Set(r.cols); rows = rows.filter(i => rs.has(i)); cols = cols.filter(j => cs.has(j)); }
  const cw = opts.cell || 28, half = cw / 2, n = rows.length, m = cols.length;
  const L = 250, T = 150, RW = 180, titleH = opts.title === false ? 0 : 34, roofH = opts.roof === false || m < 2 ? 8 : m * half + 10;
  const baseRows = [['Weighted importance', j => fmtNum(C.abs[j])], ['Relative weight', j => Math.round(C.pct[j] * 100) + '%'], ['Rank', j => C.gate[j] ? 'gate' : String(C.rank[j])], ['Difficulty', j => String(house.characteristics[j].difficulty)]];
  const BH = baseRows.length * 20 + 8;
  const W = L + m * cw + RW, Hh = titleH + roofH + T + n * cw + BH + 30;
  const y1 = titleH + roofH, y2 = y1 + T, y3 = y2 + n * cw;
  const xc = b => L + (b + 0.5) * cw;
  const sym = opts.symbols === false ? v => (v || '') : v => SYM[v];
  const fillOf = { 9: '#1c5cab', 3: '#6da7ec', 1: '#cde2fb' }, inkOf = { 9: '#ffffff', 3: '#06213f', 1: '#0b2a4d' };
  const roofFill = { '++': '#199e70', '+': '#b3e6d1', '−': '#f8cdb8', '−−': '#d95926' }, roofInk = { '++': '#ffffff', '+': '#0b3b2a', '−': '#4a2410', '−−': '#ffffff' };
  const idx = {}; house.characteristics.forEach((h, j) => { idx[h.id] = j; });
  const canon = (a, b) => idx[a] < idx[b] ? a + '|' + b : b + '|' + a;
  const cut = (s, k) => { s = str(s); return s.length > k ? s.slice(0, k - 1) + '…' : s; };
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" font-family="system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="11">`;
  o += `<rect width="${W}" height="${Hh}" fill="#ffffff"/>`;
  if (titleH) o += `<text x="8" y="22" font-size="16" font-weight="700" fill="#15212b">${xmlEsc(house.title)}</text><text x="${W - 8}" y="22" text-anchor="end" fill="#5b6977">${xmlEsc([house.meta.date ? 'as of ' + house.meta.date : '', 'weighting by ' + C.mode, opts.reduce ? 'rows and columns with relationships only' : ''].filter(Boolean).join(' · '))}</text>`;
  // roof
  if (roofH > 8) for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
    const cx = (xc(a) + xc(b)) / 2, cy = y1 - (b - a) * half; const v = house.roof[canon(house.characteristics[cols[a]].id, house.characteristics[cols[b]].id)] || '';
    o += `<polygon points="${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}" fill="${roofFill[v] || '#ffffff'}" stroke="#cbd3db"/>`;
    if (v) o += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${roofInk[v]}" font-size="10">${xmlEsc(v)}</text>`;
  }
  // header: direction, id, rotated name
  cols.forEach((j, b) => { const h = house.characteristics[j]; const x = xc(b);
    o += `<text x="${x}" y="${y1 + 12}" text-anchor="middle" fill="#5b6977">${xmlEsc(h.direction)}</text>`;
    o += `<text transform="translate(${x + 4},${y2 - 22}) rotate(-90)" fill="${h.gate ? '#b42318' : '#15212b'}" font-weight="600">${xmlEsc(cut(h.short + (h.unit ? ' (' + h.unit + ')' : ''), 30))}</text>`;
    o += `<text x="${x}" y="${y2 - 6}" text-anchor="middle" fill="#5b6977" font-family="ui-monospace, Menlo, monospace" font-size="10">${xmlEsc(h.id)}</text>`; });
  o += `<text x="8" y="${y2 - 6}" fill="#5b6977" font-size="10">NEED (WHAT)</text><text x="${L - 6}" y="${y2 - 6}" text-anchor="end" fill="#5b6977" font-size="10">IMP</text>`;
  o += `<text x="${L + m * cw + 8}" y="${y2 - 6}" fill="#5b6977" font-size="10">TODAY → GOAL · RATIO · GAP %</text>`;
  // room
  rows.forEach((i, a) => { const w = house.needs[i]; const y = y2 + a * cw;
    o += `<text x="8" y="${y + cw / 2 + 4}" fill="#5b6977" font-family="ui-monospace, Menlo, monospace" font-size="10">${xmlEsc(w.id)}</text><text x="40" y="${y + cw / 2 + 4}" fill="#15212b">${xmlEsc(cut(w.short || w.need, 32))}</text><text x="${L - 6}" y="${y + cw / 2 + 4}" text-anchor="end" fill="#15212b" font-weight="600">${w.importance}</text>`;
    cols.forEach((j, b) => { const h = house.characteristics[j]; const v = (house.relationships[w.id] || {})[h.id] || 0; const x = L + b * cw;
      o += `<rect x="${x}" y="${y}" width="${cw}" height="${cw}" fill="${fillOf[v] || '#ffffff'}" stroke="#e1e6eb"/>`;
      if (v) o += `<text x="${x + half}" y="${y + half + 4}" text-anchor="middle" fill="${inkOf[v]}" font-size="12">${xmlEsc(sym(v))}</text>`; });
    o += `<text x="${L + m * cw + 8}" y="${y + cw / 2 + 4}" fill="#15212b" font-family="ui-monospace, Menlo, monospace" font-size="10">${w.today} → ${w.goal} · ${fmt1(C.ratio[i])}× · ${pct(C.adjPct[i])}</text>`; });
  // basement
  baseRows.forEach(([label, f], r) => { const y = y3 + 6 + r * 20;
    o += `<text x="8" y="${y + 14}" fill="#5b6977">${xmlEsc(label)}</text>`;
    cols.forEach((j, b) => { const t = f(j); const gate = label === 'Rank' && C.gate[j]; o += `<text x="${xc(b)}" y="${y + 14}" text-anchor="middle" fill="${gate ? '#b42318' : C.top[j] && label === 'Rank' ? '#1c5cab' : '#15212b'}" font-weight="${label === 'Rank' ? 600 : 400}" font-family="ui-monospace, Menlo, monospace" font-size="${cw < 32 ? 9 : 10}">${xmlEsc(t)}</text>`; }); });
  o += `<line x1="${L}" y1="${y3}" x2="${L + m * cw}" y2="${y3}" stroke="#cbd3db"/>`;
  o += `<text x="8" y="${Hh - 8}" fill="#5b6977" font-size="10">● 9 strong · ○ 3 medium · △ 1 weak · roof ++ + − −− · red column names are must-pass gates (not ranked)</text>`;
  return o + '</svg>';
}
const fmtNum = x => Number.isInteger(x) ? String(x) : fmt1(x);
/** Browser helper, in the spirit of JSqfd.init: draw a house into an element from an object or a JSON URL. Returns a promise of the normalised house. */
function draw(el, src, opts) {
  const target = typeof el === 'string' ? document.querySelector(el) : el;
  const ready = typeof src === 'string' ? fetch(src).then(r => { if (!r.ok) throw new Error('could not load ' + src); return r.json(); }) : Promise.resolve(src);
  return ready.then(obj => { const r = normalize(obj); if (r.errors.length) throw new Error(r.errors.join(' ')); target.innerHTML = toSVG(r.house, opts); return r.house; });
}

// ---------- diagonalization: pure functions, no DOM ----------
// Input: mat[i][j] >= 0 for n rows (needs) and m columns (characteristics), in the listed order.
// Output: a row order and a column order that put the mass of the matrix on the diagonal, the blocks
// along that diagonal, and the measures that say how diagonal the house is before and after.
//
// Objective. Give row i the position p_i in [0,1] and column j the position q_j in [0,1] (position
// divided by n-1 or m-1, so a rectangular matrix has a diagonal from top-left to bottom-right).
// J = sum of mat[i][j] * (p_i - q_j)^2 is the squared distance of the relationships from the diagonal.
// Minimising J over all orderings is a seriation problem (NP-hard); the relaxation to real coordinates is
// solved exactly by the second singular vectors of the degree-normalised matrix, the Fiedler vector of the
// bipartite graph (Atkins, Boman and Hendrickson 1998; Dhillon 2001). We take that order, then improve it
// with a local search that moves one row or column at a time while J falls (same spirit as the bond-energy
// algorithm of McCormick, Schweitzer and White 1972). Blocks are then cut with dynamic programming so that
// the most mass lies inside the diagonal blocks, and the number of blocks is picked by bipartite
// modularity (Barber 2007). Coupling is read off the blocks the way Axiomatic Design reads a design
// matrix (Suh 1990): no mass outside the blocks is uncoupled, mass on one side only is decoupled (a
// sequence exists), mass on both sides is coupled.
function diagonalize(mat, opt){
  opt=opt||{};
  const n=mat.length,m=n?mat[0].length:0;
  const kMax=Math.max(1,Math.min(opt.kMax||6,n,m));
  const total=sum2(mat);
  const rowSum=mat.map(r=>r.reduce((a,b)=>a+b,0));
  const colSum=Array.from({length:m},(_,j)=>mat.reduce((a,r)=>a+r[j],0));
  // 1. connected components of the bipartite graph; empty rows and columns go last
  const rc=new Array(n).fill(-1),cc=new Array(m).fill(-1);let nc=0;
  for(let s=0;s<n;s++){if(rc[s]>=0||rowSum[s]===0)continue;const st=[['r',s]];rc[s]=nc;
    while(st.length){const [t,x]=st.pop();
      if(t==='r'){for(let j=0;j<m;j++)if(mat[x][j]>0&&cc[j]<0){cc[j]=nc;st.push(['c',j]);}}
      else{for(let i=0;i<n;i++)if(mat[i][x]>0&&rc[i]<0){rc[i]=nc;st.push(['r',i]);}}}
    nc++;}
  const comps=[];for(let c=0;c<nc;c++){const R=[],C=[];rc.forEach((v,i)=>{if(v===c)R.push(i);});cc.forEach((v,j)=>{if(v===c)C.push(j);});
    comps.push({R,C,mass:R.reduce((a,i)=>a+rowSum[i],0)});}
  comps.sort((a,b)=>b.mass-a.mass||a.R[0]-b.R[0]);
  let rows=[],cols=[];
  comps.forEach(cp=>{const o=spectral(mat,cp.R,cp.C);rows=rows.concat(o.rows);cols=cols.concat(o.cols);});
  for(let i=0;i<n;i++)if(rc[i]<0)rows.push(i);
  for(let j=0;j<m;j++)if(cc[j]<0)cols.push(j);
  const emptyRows=rows.filter(i=>rowSum[i]===0),emptyCols=cols.filter(j=>colSum[j]===0);
  // 2. local search on J, one row or column moved at a time, best move each pass
  const Jof=(R,C)=>{const pr=new Array(n),pc=new Array(m);R.forEach((i,a)=>pr[i]=n>1?a/(n-1):0);C.forEach((j,b)=>pc[j]=m>1?b/(m-1):0);
    let s=0;for(let i=0;i<n;i++){const r=mat[i];const p=pr[i];for(let j=0;j<m;j++){const v=r[j];if(v){const d=p-pc[j];s+=v*d*d;}}}return s;};
  const move=(arr,from,to)=>{const a=arr.slice();const [x]=a.splice(from,1);a.splice(to,0,x);return a;};
  const identity=k=>Array.from({length:k},(_,i)=>i);
  const J0=Jof(identity(n),identity(m));
  const Jspec=Jof(rows,cols);
  let J=Jspec,passes=0;
  for(;passes<80;passes++){let best=J,bR=null,bC=null;
    for(let a=0;a<n;a++)for(let b=0;b<n;b++){if(a===b)continue;const R2=move(rows,a,b);const v=Jof(R2,cols);if(v<best-1e-12){best=v;bR=R2;bC=null;}}
    for(let a=0;a<m;a++)for(let b=0;b<m;b++){if(a===b)continue;const C2=move(cols,a,b);const v=Jof(rows,C2);if(v<best-1e-12){best=v;bR=null;bC=C2;}}
    if(bR)rows=bR;else if(bC)cols=bC;else break;J=best;}
  // keep the reading direction close to the listed one (both orders are equally diagonal when reversed)
  if(corr(rows)+corr(cols)<0){rows=rows.slice().reverse();cols=cols.slice().reverse();}
  // 3. blocks along the diagonal, k chosen by bipartite modularity unless fixed
  const P=rows.map(i=>cols.map(j=>mat[i][j]));
  const byK=[];for(let k=1;k<=kMax;k++)byK.push(blocks(P,k,total));
  let k=opt.k&&opt.k>=1&&opt.k<=kMax?opt.k:byK.reduce((bi,b,idx)=>b.Q>byK[bi].Q+1e-12?idx:bi,0)+1;
  const B=byK[k-1];
  // before: the same number of blocks cut as well as possible in the listed order
  const B0=blocks(mat,k,total);
  // 4. measures and coupling
  const meas=(R,C,Bk)=>{const pr=new Array(n),pc=new Array(m);R.forEach((i,a)=>pr[i]=n>1?a/(n-1):0);C.forEach((j,b)=>pc[j]=m>1?b/(m-1):0);
    let d=0;for(let i=0;i<n;i++)for(let j=0;j<m;j++){const v=mat[i][j];if(v)d+=v*Math.abs(pr[i]-pc[j]);}
    return {J:Jof(R,C),meanDist:total?d/total:0,inBlock:total?Bk.inside/total:0,Q:Bk.Q};};
  const after=meas(rows,cols,B),before=meas(identity(n),identity(m),B0);
  // block membership in original indices
  const rowBlock=new Array(n),colBlock=new Array(m);
  B.rowCuts.forEach((c,bi)=>{for(let a=c;a<(B.rowCuts[bi+1]??n);a++)rowBlock[rows[a]]=bi;});
  B.colCuts.forEach((c,bi)=>{for(let b=c;b<(B.colCuts[bi+1]??m);b++)colBlock[cols[b]]=bi;});
  const coupling=lvl=>{const above=[],below=[];for(let i=0;i<n;i++)for(let j=0;j<m;j++){const v=mat[i][j];if(!v||v<lvl)continue;
      if(colBlock[j]>rowBlock[i])above.push({i,j,v});else if(colBlock[j]<rowBlock[i])below.push({i,j,v});}
    const verdict=!above.length&&!below.length?'uncoupled':(!above.length||!below.length)?'decoupled':'coupled';
    const cut=above.length<=below.length?above:below;
    const seq=verdict==='decoupled'?(below.length?'forward':'reverse'):(above.length<=below.length?'forward':'reverse');
    return {verdict,above,below,cut,seq};};
  const perRow=rows.map(i=>{const own=B.colCuts.length?mat[i].reduce((s,v,j)=>s+(colBlock[j]===rowBlock[i]?v:0),0):rowSum[i];return {i,own,total:rowSum[i],outside:rowSum[i]-own,blocks:[...new Set(mat[i].map((v,j)=>v?colBlock[j]:-1).filter(x=>x>=0))].sort()};});
  const perCol=cols.map(j=>{let own=0,tot=0;const bl=new Set();for(let i=0;i<n;i++){const v=mat[i][j];if(!v)continue;tot+=v;if(rowBlock[i]===colBlock[j])own+=v;bl.add(rowBlock[i]);}return {j,own,total:tot,outside:tot-own,blocks:[...bl].sort()};});
  return {n,m,rows,cols,k,kMax,blocks:B,blocksBefore:B0,byK:byK.map(b=>({k:b.k,Q:b.Q,inside:b.inside})),rowBlock,colBlock,
    before,after,Jspec,J0,passes,emptyRows,emptyCols,rowSum,colSum,total,perRow,perCol,
    strong:coupling(9),all:coupling(1)};
  function corr(order){const k=order.length;if(k<2)return 0;const mu=(k-1)/2;let s=0,ss=0;order.forEach((orig,pos)=>{s+=(pos-mu)*(orig-mu);ss+=(pos-mu)*(pos-mu);});return ss?s/ss:0;}
}
function sum2(mat){let s=0;for(const r of mat)for(const v of r)s+=v;return s;}
// Second singular vectors of the degree-normalised sub-matrix, by power iteration with the first pair deflated.
function spectral(mat,R,C){
  const n=R.length,m=C.length;
  if(n<2||m<2)return {rows:R.slice(),cols:C.slice()};
  const d1=R.map(i=>C.reduce((s,j)=>s+mat[i][j],0)),d2=C.map(j=>R.reduce((s,i)=>s+mat[i][j],0));
  const A=R.map((i,a)=>C.map((j,b)=>mat[i][j]/Math.sqrt(d1[a]*d2[b])));
  const D=Math.sqrt(d1.reduce((s,v)=>s+v,0));const u1=d1.map(v=>Math.sqrt(v)/D);
  const dot=(x,y)=>x.reduce((s,v,k)=>s+v*y[k],0);
  const norm=x=>Math.sqrt(dot(x,x))||1;
  // start: the listed order, centred, so a near-tie resolves towards the order the team wrote
  let x=R.map((_,a)=>a-(n-1)/2);let c=dot(x,u1);x=x.map((v,a)=>v-c*u1[a]);
  if(norm(x)<1e-9)x=R.map((_,a)=>(a%2?1:-1));
  let nx=norm(x);x=x.map(v=>v/nx);
  for(let it=0;it<3000;it++){
    const y=new Array(m).fill(0);for(let a=0;a<n;a++){const xa=x[a];if(!xa)continue;const Aa=A[a];for(let b=0;b<m;b++)y[b]+=Aa[b]*xa;}
    let z=A.map(Aa=>{let s=0;for(let b=0;b<m;b++)s+=Aa[b]*y[b];return s;});
    const c1=dot(z,u1);z=z.map((v,a)=>v-c1*u1[a]);
    const nz=norm(z);if(nz<1e-12)break;z=z.map(v=>v/nz);
    let diff=0;for(let a=0;a<n;a++)diff+=Math.abs(z[a]-x[a]);x=z;if(diff<1e-11)break;}
  const y=new Array(m).fill(0);for(let a=0;a<n;a++){const Aa=A[a];for(let b=0;b<m;b++)y[b]+=Aa[b]*x[a];}
  const rowCo=x.map((v,a)=>v/Math.sqrt(d1[a])),colCo=y.map((v,b)=>v/Math.sqrt(d2[b]));
  const ro=R.map((i,a)=>a).sort((a,b)=>rowCo[a]-rowCo[b]||a-b),co=C.map((j,b)=>b).sort((a,b)=>colCo[a]-colCo[b]||a-b);
  return {rows:ro.map(a=>R[a]),cols:co.map(b=>C[b])};
}
// Cut an ordered matrix P into k diagonal blocks (consecutive rows x consecutive columns). The cut maximises
// Barber's bipartite modularity Q = sum over blocks of (mass inside the block / M) - (row mass x column mass / M^2):
// the mass a block holds beyond what the row and column totals would put there by chance. Q is additive over
// blocks, so dynamic programming finds the exact optimum for a given order and k.
function blocks(P,k,total){
  const n=P.length,m=n?P[0].length:0;
  const S=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)S[i][j]=P[i-1][j-1]+S[i-1][j]+S[i][j-1]-S[i-1][j-1];
  const mass=(a0,a1,b0,b1)=>S[a1][b1]-S[a0][b1]-S[a1][b0]+S[a0][b0];
  const M=total||1;
  const gain=(a0,a1,b0,b1)=>mass(a0,a1,b0,b1)/M-(mass(a0,a1,0,m)*mass(0,n,b0,b1))/(M*M);
  const NEG=-Infinity;
  const best=Array.from({length:k+1},()=>Array.from({length:n+1},()=>new Array(m+1).fill(NEG)));
  const arg=Array.from({length:k+1},()=>Array.from({length:n+1},()=>new Array(m+1).fill(null)));
  best[0][0][0]=0;
  for(let kk=1;kk<=k;kk++)for(let a=kk;a<=n-(k-kk);a++)for(let b=kk;b<=m-(k-kk);b++){
    let bv=NEG,ba=null;
    for(let a0=kk-1;a0<a;a0++)for(let b0=kk-1;b0<b;b0++){const pv=best[kk-1][a0][b0];if(pv===NEG)continue;const v=pv+gain(a0,a,b0,b);if(v>bv+1e-15){bv=v;ba=[a0,b0];}}
    best[kk][a][b]=bv;arg[kk][a][b]=ba;}
  const rowCuts=[],colCuts=[];let a=n,b=m;
  for(let kk=k;kk>=1;kk--){const [a0,b0]=arg[kk][a][b];rowCuts.unshift(a0);colCuts.unshift(b0);a=a0;b=b0;}
  const Q=best[k][n][m];
  let inside=0;for(let bi=0;bi<k;bi++)inside+=mass(rowCuts[bi],rowCuts[bi+1]??n,colCuts[bi],colCuts[bi+1]??m);
  const sizes=rowCuts.map((c,bi)=>[(rowCuts[bi+1]??n)-c,(colCuts[bi+1]??m)-colCuts[bi]]);
  return {k,rowCuts,colCuts,inside,Q,sizes};
}
// ---------- end diagonalization ----------

return { REL_VALUES, ROOF_VALUES, DIRS, SYM, WORD, ROOF_WORD, DEFAULT_STATUS_SCALE, TESTED_CLASSES, TESTED_ALIASES, IMPORT_MAPPINGS, CSV_HEADERS,
  blank, normalize, compute, rankText, relMatrix, linksOf, itemShares, progress, reallyDone, toTSV,
  parseCSV, toCSVText, records, normHeader, classifyCSV, fromCSV, toCSV, report, diagonalize, blocks, spectral, fmt1, pct,
  toSVG, draw, reduceLists, PROPOSAL_KINDS, provKey, setProvenance, propose, confirmProposal, rejectProposal, describeProposal, nextFreeId, nextCells, toMarkdown, BOM,
  testedValue, isStale, asOfDate, todayLocal, localDate, isoDate, isoDateTime, parseDate, boardFacts, boardText, importItems, importText };
});
