#!/usr/bin/env node
/* hoq.js — command line for a House of Quality file. Uses the same code as the web page (web/hoq-core.js).
 *
 *   node tools/hoq.js validate  house.json              check the file, list errors and warnings
 *   node tools/hoq.js report    house.json [--gap]      weights, ranks, gates, diagonal order, items, progress
 *   node tools/hoq.js tsv       house.json [out.tsv]    the dated TSV (the version of record), default house-YYYY-MM-DD.tsv
 *   node tools/hoq.js csv       house.json out-dir/     the five CSV files
 *   node tools/hoq.js from-csv  dir/ [out.json]         build house.json from needs.csv, characteristics.csv, matrix.csv, roof.csv, items.csv
 *   node tools/hoq.js svg       house.json [out.svg] [--reduce] [--numbers] [--gap]   draw the house as SVG
 *   node tools/hoq.js md        house.json [out.md] [--numbers] [--gap]             the Markdown report (for an agent or a person)
 *   node tools/hoq.js next      house.json [--limit=N]  the empty cells worth looking at, and the structural gaps
 *   node tools/hoq.js skills    install|uninstall|list --target claude|codex|cursor|agents-md|all (--project DIR | --user)
 *   node tools/hoq.js diag      house.json              the diagonal order and measures as JSON (used by tools/make_xlsx.py)
 *   node tools/hoq.js sample-js house.json out.js       write the house as window.HOQ_SAMPLE = … for the web page
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', 'web', 'hoq-core.js'));

const [cmd, a1, a2] = process.argv.slice(2);
const flags = process.argv.slice(2).filter(x => x.startsWith('--'));
if (!cmd || (!a1 && cmd !== 'skills')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 15).join('\n').replace(/^ \*\s?/gm, '')); process.exit(1); }

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
if (cmd === 'svg') {
  const { house } = loadHouse(a1);
  const out = a2 && !a2.startsWith('--') ? a2 : path.basename(a1, '.json') + '.svg';
  fs.writeFileSync(out, H.toSVG(house, { reduce: flags.includes('--reduce'), symbols: !flags.includes('--numbers'), mode: flags.includes('--gap') ? 'gap' : 'importance' }));
  console.log('wrote', out);
}
if (cmd === 'md') {
  const { house } = loadHouse(a1);
  const out = a2 && !a2.startsWith('--') ? a2 : path.basename(a1, '.json') + '.md';
  fs.writeFileSync(out, H.toMarkdown(house, { symbols: !flags.includes('--numbers'), mode: flags.includes('--gap') ? 'gap' : 'importance' }));
  console.log('wrote', out);
}
if (cmd === 'next') {
  const { house } = loadHouse(a1);
  const lim = flags.find(f => f.startsWith('--limit=')); const N = H.nextCells(house, lim ? +lim.slice(8) : 10);
  console.log('Needs with no relationship:', N.unaddressedNeeds.join(', ') || 'none');
  console.log('Needs with no strong driver:', N.needsWithNoStrongDriver.join(', ') || 'none');
  console.log('Characteristics driving nothing:', N.characteristicsDrivingNothing.join(', ') || 'none');
  console.log('Proposals pending:', N.pendingProposals);
  console.log('Cells to look at next:');
  N.cells.forEach(c => console.log(`  ${c.need} × ${c.characteristic}  ${String(c.score).padStart(6)}  ${c.needShort} ← ${c.characteristicShort}: ${c.why}`));
}
if (cmd === 'skills') {
  // Install the agent skill (skills/hoq/SKILL.md) where a client reads it, the way crossmatrix does; a manifest records what was written so uninstall removes only that.
  const args = process.argv.slice(2);
  const sub = a1 || 'list';
  const target = (flags.find(f => f.startsWith('--target=')) || '--target=all').slice(9);
  const tIdx = args.indexOf('--target'); const targetArg = tIdx >= 0 ? args[tIdx + 1] : target;
  const user = flags.includes('--user');
  const pIdx = args.indexOf('--project'); const projectArg = pIdx >= 0 ? args[pIdx + 1] : (flags.find(f => f.startsWith('--project=')) || '').slice(10);
  const project = path.resolve(projectArg || '.');
  const home = require('os').homedir();
  const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'hoq', 'SKILL.md'), 'utf8');
  let targets = targetArg === 'all' ? ['claude', 'codex', 'cursor', 'agents-md'] : targetArg.split(',');
  if (user) { const dropped = targets.filter(t => t === 'cursor' || t === 'agents-md'); if (dropped.length) { console.log('skipped with --user (per-project only; run without --user inside the project):', dropped.join(', ')); targets = targets.filter(t => !dropped.includes(t)); } }
  const manifestPath = path.join(user ? home : project, '.hoq-skills.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { files: [], sections: [] };
  const MARK0 = '<!-- hoq:start -->', MARK1 = '<!-- hoq:end -->';
  const plans = targets.map(t => {
    if (t === 'claude') return { file: path.join(user ? home : project, '.claude', 'skills', 'hoq', 'SKILL.md'), text: skill };
    if (t === 'codex') return { file: path.join(user ? home : project, '.agents', 'skills', 'hoq', 'SKILL.md'), text: skill };
    if (t === 'cursor') return { file: path.join(project, '.cursor', 'rules', 'hoq.mdc'), text: '---\ndescription: Build and read a House of Quality (QFD) through the hoq MCP server\nalwaysApply: false\n---\n' + skill.replace(/^---[\s\S]*?---\n/, '') };
    if (t === 'agents-md') return { file: path.join(project, 'AGENTS.md'), section: MARK0 + '\n' + skill.replace(/^---[\s\S]*?---\n/, '') + '\n' + MARK1 + '\n' };
    console.error('unknown target', t); process.exit(1);
  });
  if (sub === 'list') { console.log(manifest.files.length || manifest.sections.length ? ['Installed from', manifestPath + ':', ...manifest.files, ...manifest.sections.map(f => f + ' (section)')].join('\n  ') : 'Nothing installed under ' + (user ? home : project)); }
  else if (sub === 'install') {
    plans.forEach(p => {
      if (p.section) { let cur = fs.existsSync(p.file) ? fs.readFileSync(p.file, 'utf8') : ''; const i = cur.indexOf(MARK0), j = cur.indexOf(MARK1); if (i >= 0 && j > i) cur = cur.slice(0, i) + p.section.trimEnd() + '\n' + cur.slice(j + MARK1.length).replace(/^\n/, ''); else cur = (cur ? cur.trimEnd() + '\n\n' : '') + p.section; fs.writeFileSync(p.file, cur); if (!manifest.sections.includes(p.file)) manifest.sections.push(p.file); console.log('wrote section in', p.file); }
      else { fs.mkdirSync(path.dirname(p.file), { recursive: true }); fs.writeFileSync(p.file, p.text); if (!manifest.files.includes(p.file)) manifest.files.push(p.file); console.log('wrote', p.file); }
    });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('Register the server too:  claude mcp add hoq -- node ' + path.join(__dirname, '..', 'mcp', 'server.js') + ' --file ./house.json');
  }
  else if (sub === 'uninstall') {
    manifest.files.forEach(f => { if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed', f); } });
    manifest.sections.forEach(f => { if (!fs.existsSync(f)) return; const cur = fs.readFileSync(f, 'utf8'); const i = cur.indexOf(MARK0), j = cur.indexOf(MARK1); if (i >= 0 && j > i) { const rest = (cur.slice(0, i) + cur.slice(j + MARK1.length)).replace(/\n{3,}/g, '\n\n'); if (rest.trim()) { fs.writeFileSync(f, rest); console.log('removed the hoq section from', f); } else { fs.unlinkSync(f); console.log('removed', f, '(it held only the hoq section)'); } } });
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  }
  else { console.error('skills: install, uninstall or list'); process.exit(1); }
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
if (!['validate', 'report', 'tsv', 'csv', 'from-csv', 'svg', 'md', 'next', 'skills', 'diag', 'sample-js'].includes(cmd)) { console.error('unknown command', cmd); process.exit(1); }
