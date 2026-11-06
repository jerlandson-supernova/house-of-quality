#!/usr/bin/env node
/* hoq.js — command line for a House of Quality file. Uses the same code as the web page (web/hoq-core.js).
 *
 *   node tools/hoq.js validate  house.json              check the file, list errors and warnings
 *   node tools/hoq.js report    house.json [--gap]      weights, ranks, gates, diagonal order, items, progress
 *   node tools/hoq.js tsv       house.json [out.tsv]    the dated TSV (the version of record), default house-YYYY-MM-DD.tsv
 *   node tools/hoq.js csv       house.json out-dir/     the five CSV files
 *   node tools/hoq.js from-csv  dir/ [out.json]         build house.json from needs.csv, characteristics.csv, matrix.csv, roof.csv, items.csv
 *   node tools/hoq.js diag      house.json              the diagonal order and measures as JSON (used by tools/make_xlsx.py)
 *   node tools/hoq.js sample-js house.json out.js       write the house as window.HOQ_SAMPLE = … for the web page
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', 'web', 'hoq-core.js'));

const [cmd, a1, a2] = process.argv.slice(2);
const flags = process.argv.slice(2).filter(x => x.startsWith('--'));
if (!cmd || !a1) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).join('\n').replace(/^ \*\s?/gm, '')); process.exit(1); }

function loadHouse(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { house, errors, warnings } = H.normalize(raw);
  if (errors.length) { console.error('Errors:\n  ' + errors.join('\n  ')); process.exit(2); }
  return { house, warnings };
}
const today = () => new Date().toISOString().slice(0, 10);

if (cmd === 'validate') {
  const raw = JSON.parse(fs.readFileSync(a1, 'utf8'));
  const { house, errors, warnings } = H.normalize(raw);
  console.log(`${house.title}: ${house.needs.length} needs, ${house.characteristics.length} characteristics, ${Object.keys(house.roof).length} roof pairs, ${Object.keys(house.items).length} items`);
  if (errors.length) console.log('Errors:\n  ' + errors.join('\n  '));
  if (warnings.length) console.log('Warnings:\n  ' + warnings.join('\n  '));
  if (!errors.length && !warnings.length) console.log('OK, nothing to fix.');
  process.exit(errors.length ? 2 : 0);
}
if (cmd === 'report') {
  const { house, warnings } = loadHouse(a1);
  console.log(H.report(house, { mode: flags.includes('--gap') ? 'gap' : 'importance' }));
  if (warnings.length) console.log('\nWarnings:\n  ' + warnings.join('\n  '));
}
if (cmd === 'tsv') {
  const { house } = loadHouse(a1);
  const C = H.compute(house.needs, house.characteristics, house.relationships, { mode: flags.includes('--gap') ? 'gap' : 'importance' });
  const out = a2 && !a2.startsWith('--') ? a2 : `${path.basename(a1, '.json')}-${today()}.tsv`;
  fs.writeFileSync(out, H.toTSV(house, C));
  console.log('wrote', out);
}
if (cmd === 'csv') {
  const { house } = loadHouse(a1);
  const dir = a2 || '.';
  fs.mkdirSync(dir, { recursive: true });
  const files = H.toCSV(house);
  Object.keys(files).forEach(f => fs.writeFileSync(path.join(dir, f), files[f]));
  console.log('wrote', Object.keys(files).join(', '), 'in', dir);
}
if (cmd === 'from-csv') {
  const dir = a1; const tables = {};
  fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv')).forEach(f => {
    const rows = H.parseCSV(fs.readFileSync(path.join(dir, f), 'utf8'));
    const kind = H.classifyCSV(rows, f);
    if (kind) tables[kind] = rows; else console.error('skipped', f, '(could not tell which table it is)');
  });
  const base = fs.existsSync(path.join(dir, 'house.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'house.json'), 'utf8')) : {};
  const { house, errors, warnings } = H.fromCSV(tables, base);
  if (warnings.length) console.error('Warnings:\n  ' + warnings.join('\n  '));
  if (errors.length) { console.error('Errors:\n  ' + errors.join('\n  ')); process.exit(2); }
  const out = a2 || path.join(dir, 'house.json');
  fs.writeFileSync(out, JSON.stringify(house, null, 2));
  console.log('wrote', out, 'from', Object.keys(tables).join(', '));
}
if (cmd === 'diag') {
  const { house } = loadHouse(a1);
  const use = flags.includes('--strong') ? 'strong' : 'all';
  const kArg = flags.find(f => f.startsWith('--k=')); const k = kArg ? +kArg.slice(4) : 0;
  const mat = H.relMatrix(house, use);
  const r = H.diagonalize(mat, { k, kMax: 8 });
  const W = i => house.needs[i].id, X = j => house.characteristics[j].id;
  const ties = c => c.map(t => ({ w: W(t.i), h: X(t.j), v: t.v }));
  const names = r.blocks.colCuts.map((c, bi) => { const js = r.cols.slice(c, r.blocks.colCuts[bi + 1] ?? r.m); const key = js.map(X).sort().join('+'); if (house.blockNames[key]) return house.blockNames[key];
    const top = js.slice().sort((a, b) => r.colSum[b] - r.colSum[a] || a - b).slice(0, 2).map(j => house.characteristics[j].short); return top.join(' · ') + (js.length > 2 ? ' …' : ''); });
  const DIAG = { use, k: r.k, kMax: r.kMax, rows: r.rows.map(W), cols: r.cols.map(X), rowCuts: r.blocks.rowCuts, colCuts: r.blocks.colCuts, sizes: r.blocks.sizes, names,
    before: r.before, after: r.after, blocksBefore: { rowCuts: r.blocksBefore.rowCuts, colCuts: r.blocksBefore.colCuts }, J0: r.J0, Jspec: r.Jspec, passes: r.passes, byK: r.byK,
    rowBlock: Object.fromEntries(house.needs.map((w, i) => [w.id, r.rowBlock[i]])), colBlock: Object.fromEntries(house.characteristics.map((h, j) => [h.id, r.colBlock[j]])),
    strong: { verdict: r.strong.verdict, above: ties(r.strong.above), below: ties(r.strong.below), cut: ties(r.strong.cut) },
    all: { verdict: r.all.verdict, above: ties(r.all.above), below: ties(r.all.below), cut: ties(r.all.cut) },
    perCol: r.perCol.map(x => ({ h: X(x.j), own: x.own, total: x.total, outside: x.outside, blocks: x.blocks })),
    perRow: r.perRow.map(x => ({ w: W(x.i), own: x.own, total: x.total, outside: x.outside, blocks: x.blocks })),
    noStrongW: house.needs.filter(w => !house.characteristics.some(h => (house.relationships[w.id] || {})[h.id] === 9)).map(w => w.id),
    noStrongH: house.characteristics.filter(h => !house.needs.some(w => (house.relationships[w.id] || {})[h.id] === 9)).map(h => h.id),
    method: 'spectral seriation (Fiedler vector of the bipartite graph) + local search on J = sum r_ij (p_i - q_j)^2; blocks by bipartite modularity (Barber 2007), exact for the order by dynamic programming' };
  process.stdout.write(JSON.stringify(DIAG));
}
if (cmd === 'sample-js') {
  const { house } = loadHouse(a1);
  fs.writeFileSync(a2 || 'web/sample-house.js', 'window.HOQ_SAMPLE=' + JSON.stringify(house, null, 1) + ';\n');
  console.log('wrote', a2 || 'web/sample-house.js');
}
if (!['validate', 'report', 'tsv', 'csv', 'from-csv', 'diag', 'sample-js'].includes(cmd)) { console.error('unknown command', cmd); process.exit(1); }
