#!/usr/bin/env node
/* Unit checks of web/hoq-core.js that need no server: links, CSV round trip, proposals, revision, markdown, next. Run: npm test */
'use strict';
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'web', 'hoq-core.js'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
// links
eq(H.linksOf('L3CD-48 to 51'), ['L3CD-48', 'L3CD-49', 'L3CD-50', 'L3CD-51'], 'range from the key number');
eq(H.linksOf('KAN-120, 62 to 68; L3CD-83'), ['KAN-120', 'KAN-62', 'KAN-63', 'KAN-64', 'KAN-65', 'KAN-66', 'KAN-67', 'KAN-68', 'L3CD-83'], 'mixed list');
eq(H.linksOf('Phone playbook; L3CD-33, 36, 37'), ['L3CD-33', 'L3CD-36', 'L3CD-37'], 'prose segment ignored');
eq(H.linksOf('MUG-3, design note', { 'MUG-3': {} }), ['MUG-3'], 'plain key kept only when it is an item');
// sample: normalize, csv round trip
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'sample-house.json'), 'utf8'));
const r = H.normalize(sample); ok(!r.errors.length && !r.warnings.length, 'sample normalizes clean');
const h = r.house; const csv = H.toCSV(h);
const back = H.fromCSV({ needs: H.parseCSV(csv['needs.csv']), characteristics: H.parseCSV(csv['characteristics.csv']), matrix: H.parseCSV(csv['matrix.csv']), roof: H.parseCSV(csv['roof.csv']), items: H.parseCSV(csv['items.csv']) }, { title: h.title, meta: h.meta });
const norm = rel => JSON.stringify(Object.keys(rel).sort().map(w => [w, Object.keys(rel[w]).sort().map(k => [k, rel[w][k]])]));
eq(norm(back.house.relationships), norm(h.relationships), 'csv round trip keeps the room');
eq(back.house.roof, h.roof, 'csv round trip keeps the roof');
eq(Object.keys(back.house.items).length, Object.keys(h.items).length, 'csv round trip keeps the items');
ok(back.house.characteristics[2].gate === true, 'gate survives csv');
eq(H.parseCSV('a,b\n"x, y","he said ""hi"""\n'), [['a', 'b'], ['x, y', 'he said "hi"']], 'csv quotes');
eq(H.parseCSV(H.BOM + 'a,b\n1,2\n'), [['a', 'b'], ['1', '2']], 'a byte-order mark is stripped on read');
// compute: ranks skip gates, weights match a hand sum
const C = H.compute(h.needs, h.characteristics, h.relationships, {});
eq(C.abs[1], 81, 'H2 weight'); ok(C.rank[1] === 1 && C.gate[2] && C.rank[2] === 0, 'rank and gate');
// proposals, confirm clears rivals, revision untouched by the core
const rev = h.revision;
const p1 = H.propose(h, { kind: 'cell', need: 'W3', characteristic: 'H2', value: 3, by: 'agent-a', note: 'a' }).proposal;
const p2 = H.propose(h, { kind: 'cell', need: 'W3', characteristic: 'H2', value: 9, by: 'agent-b' }).proposal;
ok(h.proposals.length === 2, 'two actors, two proposals');
ok(!h.relationships.W3.H2, 'a proposal changes no cell');
const c = H.confirmProposal(h, p1.id, 'John');
ok(h.relationships.W3.H2 === 3 && c.dropped.length === 1 && c.dropped[0] === p2.id && h.proposals.length === 0, 'confirm applies and drops the rival');
ok(h.provenance['cell:W3|H2'].by === 'agent-a' && h.provenance['cell:W3|H2'].confirmedBy === 'John' && h.provenance['cell:W3|H2'].note === 'a', 'provenance after confirm');
ok(h.revision === rev, 'the core does not bump revision; callers do');
ok(H.propose(h, { kind: 'importance', need: 'W1', value: 9 }).error, 'importance 9 refused');
ok(H.propose(h, { kind: 'roof', a: 'H1', b: 'H1', value: '+' }).error, 'self roof refused');
const p3 = H.propose(h, { kind: 'roof', a: 'H9', b: 'H1', value: '--', by: 'agent' }).proposal; ok(p3.value === '−−', 'roof -- normalised');
H.confirmProposal(h, p3.id, 'John'); ok(h.roof['H1|H9'] === '−−', 'roof confirm uses the canonical key');
// next and markdown
const N = H.nextCells(h, 3); ok(N.cells.length === 3 && N.unaddressedNeeds.length === 0, 'next on the sample');
h.needs.push({ id: 'W9', need: 'Orphan', short: 'Orphan', source: '', importance: 4, today: 1, goal: 5, links: '', why: '' }); h.relationships.W9 = {};
const N2 = H.nextCells(h, 3); ok(N2.unaddressedNeeds[0] === 'W9' && N2.cells[0].need === 'W9', 'an unaddressed need ranks first');
const md = H.toMarkdown(h); ok(md.includes('## The room') && md.includes('W9') && md.includes('Needs with no relationship: W9'), 'markdown mentions the orphan');
const svg = H.toSVG(h, { reduce: true }); ok(!svg.includes('Orphan'), 'reduce hides the orphan in the drawing');
// proposals for whole rows and columns: fields normalized, id assigned, rivals by text dropped, defaulted scores flagged
const before = h.needs.length;
const n1 = H.propose(h, { kind: 'need', fields: { need: 'Lid opens with one hand', source: 'Interview 3' }, by: 'agent-a', evidence: 'one hand' }).proposal;
const n2 = H.propose(h, { kind: 'need', fields: { need: 'lid opens with one hand ' }, by: 'agent-b' }).proposal;
ok(n1 && n2 && n1.kind === 'need' && h.proposals.length === 2 && h.needs.length === before, 'need proposals add no row');
const cn = H.confirmProposal(h, n1.id, 'John');
ok(cn.added && /^W\d+$/.test(cn.added.id) && h.needs.filter(x => x.id === cn.added.id).length === 1 && h.needs.length === before + 1 && JSON.stringify(h.relationships[cn.added.id]) === '{}', 'confirmed need added once with a free id: ' + JSON.stringify(cn.added && cn.added.id));
ok(cn.dropped.length === 1 && cn.dropped[0] === n2.id && h.proposals.length === 0, 'rival need by text dropped and reported');
ok(cn.warning && /importance, today, goal/.test(cn.warning) && h.needs[before].importance === 3, 'defaulted scores flagged: ' + cn.warning);
ok(h.provenance['need:' + cn.added.id].by === 'agent-a' && h.provenance['need:' + cn.added.id].confirmedBy === 'John' && h.provenance['need:' + cn.added.id].evidence === 'one hand', 'need provenance');
const n3 = H.propose(h, { kind: 'need', fields: { need: 'Given', importance: 4, today: 2, goal: 5 }, by: 'agent-a' }).proposal; ok(!H.confirmProposal(h, n3.id, 'John').warning && h.needs[h.needs.length - 1].importance === 4, 'no warning when the scores were given');
ok(H.propose(h, { kind: 'need', fields: { id: 'W1', need: 'Clash' } }).error, 'an id already in use is refused');
ok(H.propose(h, { kind: 'characteristic', fields: { unit: 'N' } }).error, 'a member without text is refused');
const c1 = H.propose(h, { kind: 'characteristic', value: 'Lid opening force', fields: { unit: 'N', direction: 'down', target: '≤ 15 N' }, by: 'agent-a' }).proposal;
ok(c1 && H.describeProposal(c1) === 'new characteristic: Lid opening force (N)', 'characteristic described with its unit');
const cc = H.confirmProposal(h, c1.id, 'John');
ok(cc.added && cc.added.name === 'Lid opening force' && cc.added.unit === 'N' && cc.added.direction === '↓' && h.characteristics[h.characteristics.length - 1].id === cc.added.id && h.provenance['characteristic:' + cc.added.id].confirmedBy === 'John' && !cc.warning, 'characteristic text taken from value, direction word mapped: ' + JSON.stringify(cc.added));
if (fails) { console.error(fails, 'core checks failed'); process.exit(1); }
console.log('core checks ok');
