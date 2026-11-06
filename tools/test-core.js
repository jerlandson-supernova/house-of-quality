#!/usr/bin/env node
/* Unit checks of web/hoq-core.js that need no server: links, the verdict scale, dates, CSV round trip, tracker import, board facts, proposals, revision, markdown, next. Run: npm test */
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
eq(H.linksOf('L3CD-83 with KAN-71'), ['L3CD-83', 'KAN-71'], 'two projects in one segment');
eq(H.linksOf('MUG-1 with MUG-2'), ['MUG-1', 'MUG-2'], 'a path label with two keys');
eq(H.linksOf('Phase 2 of L3CD-40'), ['L3CD-40'], 'a bare number before any key is not a key');
// the verdict scale and its aliases
eq(H.testedValue('failed'), { value: 'fails', dropped: '' }, 'failed → fails silently');
eq(H.testedValue('Fails'), { value: 'fails', dropped: '' }, 'case does not matter');
eq(H.testedValue('not retested'), { value: '', dropped: 'not retested' }, 'not retested is dropped');
eq(Object.keys(H.TESTED_CLASSES), ['verified', 'partial', 'fails', 'not built'], 'four verdicts');
{ const r = H.normalize({ needs: [{ id: 'W1', need: 'x', links: 'K-1, K-2' }], characteristics: [{ id: 'H1', name: 'y', links: 'K-1' }], relationships: { W1: { H1: 9 } }, items: { 'K-1': { status: 'Done', tested: 'failed', retested: '05/Nov/26 2:14 PM', updated: '2026-11-04T14:12:33.000+0000' }, 'K-2': { status: 'Done', tested: 'not retested' } } });
  ok(r.house.items['K-1'].tested === 'fails' && r.house.items['K-1'].retested === '2026-11-05' && r.house.items['K-1'].updated === '2026-11-04T14:12:33.000Z', 'item fields normalised: ' + JSON.stringify(r.house.items['K-1']));
  ok(r.house.items['K-2'].tested === '' && r.warnings.filter(w => /not retested/.test(w)).length === 1 && /K-2/.test(r.warnings.find(w => /not retested/.test(w))), 'one warning names the item: ' + r.warnings.join(' | '));
  eq(H.reallyDone(r.house, 'Done', 'fails'), ['overstated', 'bad'], 'done + fails');
  eq(H.reallyDone(r.house, 'Done', ''), ['no test yet', 'mute'], 'done + no test');
  eq(H.reallyDone(r.house, 'Staging', 'not built'), ['overstated', 'bad'], 'staging + not built');
  eq(H.reallyDone(r.house, 'To Do', 'verified'), ['understated', 'ok'], 'to do + verified'); }
// dates
eq([H.isoDate('2026-11-20'), H.isoDate('10/Nov/26 9:00 AM'), H.isoDate('5/Nov/2026'), H.isoDate('nonsense'), H.isoDateTime('2026-11-20'), H.isoDateTime('')], ['2026-11-20', '2026-11-10', '2026-11-05', '', '2026-11-20', ''], 'isoDate forms');
ok(/^\d{4}-\d{2}-\d{2}$/.test(H.todayLocal()) && H.isoDate(new Date().toISOString()) === H.todayLocal(), 'today is the local date');
ok(H.isStale({ updated: '2026-11-04T23:30:00.000Z', retested: '2026-10-29' }) === true && H.isStale({ updated: '2026-10-28T17:12:00.000Z', retested: '2026-10-30' }) === false && H.isStale({ updated: '2026-11-04', retested: '' }) === false, 'isStale three cases');
eq(H.asOfDate({ meta: { boardRead: '2026-11-06T17:00:00.000Z', date: '2026-11-05' } }).source, 'board read', 'board read beats the data date');
eq(H.asOfDate({ meta: { date: '2026-11-05' } }), { date: '2026-11-05', source: 'data date' }, 'data date when no board read');
eq(H.asOfDate({ meta: {} }).source, 'today', 'today as the last resort');
// csv classification
eq(H.classifyCSV([['Summary', 'Issue key', 'Status', 'Updated']]), 'items-tracker', 'a Jira export is a tracker table');
eq(H.classifyCSV([H.CSV_HEADERS.items]), 'items', 'the items header');
eq(H.records([['Issue key', 'Sprint', 'Sprint'], ['K-1', 'Sprint 3', 'Sprint 4'], ['K-2', 'Sprint 2', '']]).map(r => r.sprint), ['Sprint 4', 'Sprint 2'], 'repeated headers keep the last non-empty value');
// sample: normalize, csv round trip
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'sample-house.json'), 'utf8'));
const r = H.normalize(sample); ok(!r.errors.length && !r.warnings.length, 'sample normalizes clean');
const h = r.house; const csv = H.toCSV(h);
const back = H.fromCSV({ needs: H.parseCSV(csv['needs.csv']), characteristics: H.parseCSV(csv['characteristics.csv']), matrix: H.parseCSV(csv['matrix.csv']), roof: H.parseCSV(csv['roof.csv']), items: H.parseCSV(csv['items.csv']) }, { title: h.title, meta: h.meta });
const norm = rel => JSON.stringify(Object.keys(rel).sort().map(w => [w, Object.keys(rel[w]).sort().map(k => [k, rel[w][k]])]));
eq(norm(back.house.relationships), norm(h.relationships), 'csv round trip keeps the room');
eq(back.house.roof, h.roof, 'csv round trip keeps the roof');
eq(Object.keys(back.house.items).length, Object.keys(h.items).length, 'csv round trip keeps the items');
ok(back.house.items['MUG-7'].retested === '2026-10-29' && back.house.items['MUG-7'].updated === h.items['MUG-7'].updated && back.house.items['MUG-3'].tested === 'fails', 'csv round trip keeps retested, updated and the verdict');
// boardFacts on the sample
{ const F = H.boardFacts(h);
  eq(F.overdue.map(o => o.key), ['MUG-3'], 'MUG-3 is the overdue item'); ok(F.overdue[0].daysLate === 4 && F.asOf === '2026-11-05' && F.asOfSource === 'data date', 'four days late against the data date: ' + JSON.stringify(F.overdue[0]));
  eq(F.mismatch.map(m => m.key + ':' + m.kind), ['MUG-3:not yet', 'MUG-7:open clauses'], 'the board and the tests disagree on MUG-3 and MUG-7');
  ok(F.mismatch[1].stale === true && F.counts.stale === 1, 'MUG-7 changed on the board after its test');
  ok(F.path.source === 'narrative' && F.path.firstOpen === 0 && F.path.steps[1].keys.join() === 'MUG-1,MUG-2', 'the critical path from the file, first step open');
  ok(F.gates.length === 2 && F.gates[0].id === 'H3' && F.gates[0].state === 'blocked' && F.gates[1].state === 'clear' && F.counts.gatesClear === 1, 'two gates, one blocked: ' + F.gates.map(g => g.id + ' ' + g.state).join(', '));
  ok(F.rows.length === 8 && F.rows.find(r => r.key === 'MUG-5').verdict === 'no test yet' && F.counts.noTest === 2, 'rows and no-test count');
  ok(!JSON.stringify(F).includes('not retested') && !H.report(h).includes('not retested') && !H.toMarkdown(h).includes('not retested'), 'nothing says "not retested" any more');
  ok(H.toMarkdown(h).includes('| Retested on | Changed since |') && H.toMarkdown(h).includes('### Board against tests') && H.report(h).includes('BOARD AGAINST TESTS'), 'report and markdown carry the board block'); }
// importItems: a Jira export merges statuses and keeps the verdicts
{ const hh = H.normalize(sample).house; const rows = H.records(H.parseCSV(fs.readFileSync(path.join(__dirname, '..', 'examples', 'csv', 'tracker-export.csv'), 'utf8')));
  const r = H.importItems(hh, rows, { mapping: 'jira', source: 'Jira CSV export', readAt: '2026-11-06T17:00:00.000Z' });
  ok(hh.items['MUG-3'].status === 'Done' && hh.items['MUG-3'].due === '2026-11-10' && hh.items['MUG-3'].tested === 'fails' && hh.items['MUG-3'].retested === '2026-11-04' && hh.items['MUG-3'].note.startsWith('Rig built'), 'MUG-3 merged: status and due from the export, verdict and note kept: ' + JSON.stringify(hh.items['MUG-3']));
  ok(hh.items['MUG-3'].updated === new Date(2026, 10, 6, 8, 2).toISOString() && hh.items['MUG-3'].resolved === hh.items['MUG-3'].updated && hh.items['MUG-3'].priority === 'Highest' && hh.items['MUG-3'].sprint === 'Sprint 4', 'updated, resolved, priority and sprint read: ' + JSON.stringify(hh.items['MUG-3']));
  ok(hh.items['MUG-1'].sprint === 'Sprint 4' && hh.items['MUG-1'].effort === '5', 'the last non-empty Sprint wins; story points land in effort');
  ok(r.changes.some(c => c.key === 'MUG-3' && c.field === 'status' && c.from === 'In Review' && c.to === 'Done') && !r.changes.some(c => ['tested', 'retested', 'note'].includes(c.field)), 'changes listed, verdict fields untouched');
  ok(!hh.items['MUG-99'] && r.skipped.some(s => s.key === 'MUG-99'), 'MUG-99 skipped: no links field names it');
  ok(hh.meta.boardRead === '2026-11-06T17:00:00.000Z' && hh.meta.boardSource === 'Jira CSV export', 'board read and source recorded');
  const F2 = H.boardFacts(hh); ok(F2.asOf === H.isoDate('2026-11-06T17:00:00.000Z') && F2.asOfSource === 'board read' && F2.overdue.length === 0, 'after the import, lateness is judged against the read date: ' + F2.asOf);
  ok(F2.mismatch.some(m => m.key === 'MUG-3' && m.kind === 'overstated') && F2.mismatch.some(m => m.key === 'MUG-7' && m.stale), 'MUG-3 Done on the board but fails the test: overstated');
  const h3 = H.normalize(sample).house; const r3 = H.importItems(h3, rows, { add: 'all' }); ok(h3.items['MUG-99'] && h3.items['MUG-99'].status === 'To Do' && h3.items['MUG-99'].tested === '' && r3.added.length === 1, 'add: all adds MUG-99 with no verdict');
  const r4 = H.importItems(H.normalize(sample).house, rows, { add: 'none' }); ok(r4.added.length === 0 && r4.skipped.some(s => s.key === 'MUG-99'), 'add: none adds nothing');
  const viaCsv = H.fromCSV({ 'items-tracker': H.parseCSV(fs.readFileSync(path.join(__dirname, '..', 'examples', 'csv', 'tracker-export.csv'), 'utf8')) }, JSON.parse(JSON.stringify(sample)), { source: 'drop' });
  ok(viaCsv.house.items['MUG-3'].status === 'Done' && viaCsv.house.items['MUG-3'].tested === 'fails' && viaCsv.import && viaCsv.import.changes.length === r.changes.length && viaCsv.house.meta.boardSource === 'drop', 'fromCSV routes a tracker table through importItems');
  ok(H.importText(r).some(l => /MUG-3 .*status In Review → Done/.test(l)), 'importText prints key field old → new: ' + H.importText(r).join(' | ')); }
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
