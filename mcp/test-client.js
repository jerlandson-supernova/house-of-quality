#!/usr/bin/env node
/* Exercises the MCP server end to end over stdio: builds a small house, proposes cells, confirms them as a person,
 * reads it back, exports it, checks the autosave and the change log. Run: npm test */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const must = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

async function session(extraArgs, file) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, 'server.js'), '--file', file].concat(extraArgs) });
  const client = new Client({ name: 'hoq-test', version: '0.0.1' });
  await client.connect(transport);
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args || {} }); const t = r.content.map(c => c.text).join('\n'); if (r.isError) throw new Error(name + ': ' + t); return t; };
  return { client, call };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoq-mcp-'));
  const file = path.join(dir, 'house.json');

  // 1. default mode: the agent proposes, a person confirms
  let { client, call } = await session(['--actor', 'agent'], file);
  const tools = (await client.listTools()).tools.map(t => t.name);
  console.log('tools:', tools.length, '·', tools.join(', '));
  must(tools.includes('proposal_confirm') && tools.includes('house_next') && tools.includes('house_markdown') && tools.includes('house_log'), 'missing tools');
  console.log(await call('house_new', { title: 'Test kettle', date: '2026-11-05', todayLabel: 'prototype', author: 'John' }));
  await call('need_set', { need: 'Boils a litre in under three minutes', short: 'Fast boil', source: 'Survey', importance: 5, today: 2, goal: 5, links: 'K-1', by: 'Survey, 40 commuters' });
  await call('need_set', { need: 'Does not scald the hand on the lid', short: 'Safe lid', source: 'Safety review', importance: 5, today: 3, goal: 5, links: 'K-2', by: 'Safety review' });
  await call('need_set', { need: 'Costs under thirty', short: 'Cheap', source: 'Pricing', importance: 3, today: 4, goal: 4, links: 'K-3', by: 'Pricing' });
  await call('characteristic_set', { name: 'Heater power', unit: 'W', direction: '↑', target: '≥ 2400 W', today: '1800 W', links: 'K-1' });
  await call('characteristic_set', { name: 'Lid surface temperature at boil', unit: '°C', direction: '↓', target: '≤ 45', today: '58', gate: true, links: 'K-2' });
  await call('characteristic_set', { name: 'Unit cost', unit: '$', direction: '↓', target: '≤ 12', today: '14', links: 'K-3' });
  const next0 = JSON.parse(await call('house_next', { limit: 5 }));
  must(next0.unaddressedNeeds.length === 3 && next0.cells.length === 5, 'house_next before any cell: ' + JSON.stringify(next0).slice(0, 120));
  console.log('next (empty house):', next0.cells.map(c => c.need + '×' + c.characteristic).join(' '), '· unaddressed', next0.unaddressedNeeds.join(' '));
  const many = await call('relationships_set_many', { cells: [{ need: 'W1', characteristic: 'H1', value: 9, note: 'power is the mechanism' }, { need: 'W2', characteristic: 'H2', value: 'strong' }, { need: 'W3', characteristic: 'H3', value: 9 }, { need: 'W3', characteristic: 'H1', value: 3 }, { need: 'W2', characteristic: 'H1', value: 1 }] });
  must(many.startsWith('5 proposals made'), 'relationships_set_many should propose: ' + many.slice(0, 80));
  const roofP = await call('roof_set', { a: 'H1', b: 'H3', value: '--', note: 'more power costs more' });
  must(roofP.startsWith('Proposed'), 'roof_set should propose');
  let pr = JSON.parse(await call('house_priorities', {}));
  must(pr.characteristics.every(c => c.weight === 0) && pr.pendingProposals === 6, 'proposals must count in no number: ' + JSON.stringify(pr.characteristics.map(c => c.weight)));
  let list = JSON.parse(await call('proposals_list', {}));
  console.log('proposals pending:', list.map(p => p.id + ' ' + p.what).join(' · '));
  let refused = false; try { await call('proposal_confirm', { id: list[0].id, confirmedBy: 'agent' }); } catch (e) { refused = true; }
  must(refused, 'the agent must not confirm its own proposal');
  for (const p of list) await call('proposal_confirm', { id: p.id, confirmedBy: 'John' });
  must(JSON.parse(await call('proposals_list', {})).length === 0, 'proposals should be empty after confirming');
  const prov = JSON.parse(await call('house_get', { part: 'provenance' }));
  must(prov['cell:W1|H1'] && prov['cell:W1|H1'].by === 'agent' && prov['cell:W1|H1'].confirmedBy === 'John' && prov['cell:W1|H1'].note === 'power is the mechanism', 'provenance of a confirmed cell: ' + JSON.stringify(prov['cell:W1|H1']));
  must(prov['importance:W1'] && prov['importance:W1'].by === 'Survey, 40 commuters', 'provenance of importance: ' + JSON.stringify(prov['importance:W1']));
  await call('item_set', { key: 'K-1', title: 'Bigger element', status: 'In Progress', due: '2026-11-20', effort: 3, tested: 'partial', retested: '2026-11-04' });
  await call('item_set', { key: 'K-2', title: 'Double-wall lid', status: 'Done', due: '2026-10-30', effort: 2, tested: 'verified' });
  const k3 = await call('item_set', { key: 'K-3', title: 'Cheaper element', status: 'Done', due: '2026-10-20', effort: 1, tested: 'failed' });
  must(/recorded as fails/.test(k3), 'failed is read as fails and the response says so: ' + k3.slice(0, 120));
  must(JSON.parse(await call('house_get', { part: 'items' }))['K-3'].tested === 'fails', 'tested reads back as fails');
  pr = JSON.parse(await call('house_priorities', {}));
  console.log('priorities:', pr.characteristics.map(c => `${c.id} ${c.weight} ${c.rank}`).join(' · '));
  must(pr.characteristics[0].id === 'H1' && pr.characteristics[0].weight === 59 && pr.characteristics.find(c => c.id === 'H2').rank === 'gate', 'priorities wrong');
  const dg = JSON.parse(await call('house_diagonal', {}));
  console.log('diagonal:', dg.blocks.map(b => `${b.block}: ${b.needs.join(' ')} × ${b.characteristics.join(' ')}`).join(' · '), '·', dg.coupling.strongOnly.verdict, '/', dg.coupling.allLevels.verdict);
  let it = JSON.parse(await call('house_items', {}));
  must(it.items.find(x => x.key === 'K-2').reallyDone === 'holds' && it.items.find(x => x.key === 'K-3').reallyDone === 'overstated', 'reallyDone wrong: ' + it.items.map(x => x.key + ' ' + x.reallyDone).join(', '));
  must(it.asOf === '2026-11-05' && it.asOfSource === 'data date' && it.gates.length === 1 && it.gates[0].state === 'clear' && it.mismatch.some(m => m.key === 'K-3' && m.kind === 'overstated') && Array.isArray(it.overdue) && it.path.firstOpen === 0, 'house_items carries the daily read: ' + JSON.stringify({ asOf: it.asOf, gates: it.gates.map(g => g.id + ' ' + g.state), mismatch: it.mismatch.map(m => m.key + ' ' + m.kind), path: it.path.firstOpen }));
  const dry = await call('items_import', { rows: [{ 'Issue key': 'K-1', Status: 'Done', Updated: '2026-11-21T09:00:00.000+0000' }], source: 'test board', dryRun: true });
  must(dry.startsWith('Dry run') && /K-1 .*status In Progress → Done/.test(dry) && JSON.parse(await call('house_get', { part: 'items' }))['K-1'].status === 'In Progress', 'a dry run changes nothing: ' + dry.slice(0, 160));
  const imp = await call('items_import', { rows: [{ issue_key: 'K-1', status: 'Done', updated: '2026-11-21T09:00:00.000+0000' }, { issue_key: 'K-9', status: 'To Do', summary: 'Not linked' }], source: 'test board' });
  must(imp.startsWith('Statuses merged from test board: 2 changes, 0 added'), 'items_import applies (status and updated changed): ' + imp.slice(0, 120));
  const items2 = JSON.parse(await call('house_get', { part: 'items' }));
  must(items2['K-1'].status === 'Done' && items2['K-1'].tested === 'partial' && items2['K-1'].retested === '2026-11-04' && items2['K-1'].updated === '2026-11-21T09:00:00.000Z' && !items2['K-9'], 'import keeps the verdict, records updated, adds only linked keys: ' + JSON.stringify(items2['K-1']));
  it = JSON.parse(await call('house_items', {}));
  must(it.items.find(x => x.key === 'K-1').stale === true && it.mismatch.some(m => m.key === 'K-1' && m.kind === 'open clauses' && m.stale) && it.asOfSource === 'board read' && it.board.source === 'test board', 'K-1 is stale after the import and lateness follows the board read: ' + JSON.stringify(it.mismatch));
  const md = await call('house_markdown', {});
  must(md.startsWith('# Test kettle') && md.includes('## The room') && md.includes('| W1 Fast boil | ● |') && md.includes('## Provenance'), 'markdown wrong: ' + md.slice(0, 200));
  console.log('markdown:', md.split('\n').length, 'lines,', (md.match(/^## /gm) || []).length, 'sections');
  const svg = await call('house_draw', { reduce: true });
  must(svg.startsWith('<svg') && svg.includes('Fast boil'), 'svg wrong');
  console.log(await call('house_export', { format: 'tsv', path: path.join(dir, 'house.tsv') }));
  console.log(await call('house_export', { format: 'md', path: path.join(dir, 'house.md') }));
  console.log(await call('house_export', { format: 'csv', path: path.join(dir, 'csv') }));
  const v = JSON.parse(await call('house_validate', {}));
  must(v.errors.length === 0, 'validate: ' + v.errors.join(' '));
  const log = JSON.parse(await call('house_log', { limit: 100 }));
  must(log.some(l => l.op === 'proposal.confirm' && l.confirmedBy === 'John') && log.some(l => l.op === 'cells.propose') && log.some(l => l.op === 'items.import' && l.changes && l.changes[0].key === 'K-1'), 'log is missing entries: ' + log.map(l => l.op).join(','));
  must(fs.existsSync(path.join(dir, 'house.log.jsonl')), 'log file missing');
  console.log('log:', log.length, 'entries, on disk at', path.join(dir, 'house.log.jsonl'));
  const res = await client.readResource({ uri: 'hoq://report.md' });
  must(res.contents[0].text.startsWith('# Test kettle'), 'markdown resource wrong');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  must(saved.needs.length === 3 && saved.characteristics.length === 3 && saved.roof['H1|H3'] === '−−' && saved.revision > 0 && saved.proposals.length === 0, 'autosave wrong');
  await client.close();

  // 2. --direct mode: cells are written straight away, with provenance; --no-confirm hides the confirm tool
  ({ client, call } = await session(['--direct', '--no-confirm', '--actor', 'importer'], file));
  const tools2 = (await client.listTools()).tools.map(t => t.name);
  must(!tools2.includes('proposal_confirm'), '--no-confirm should hide proposal_confirm');
  const direct = await call('relationship_set', { need: 'W1', characteristic: 'H3', value: 1, note: 'imported from the old sheet', evidence: 'sheet v3 row 12' });
  must(direct.startsWith('W1 × H3 = 1'), '--direct should write: ' + direct.slice(0, 60));
  const prov2 = JSON.parse(await call('house_get', { part: 'provenance' }));
  must(prov2['cell:W1|H3'].by === 'importer' && prov2['cell:W1|H3'].evidence === 'sheet v3 row 12', 'direct provenance wrong');
  const p3 = await call('propose', { kind: 'importance', need: 'W3', value: 4, note: 'pricing said cost matters more now' });
  must(p3.startsWith('Proposed'), 'propose tool');
  const rej = await call('proposal_reject', { id: JSON.parse(await call('proposals_list', {}))[0].id, reason: 'not agreed' });
  must(rej.startsWith('Rejected'), 'reject');
  await client.close();
  console.log('direct mode and reject ok');

  // 3. --assist with the mock provider: suggestions arrive as proposals only
  ({ client, call } = await session(['--assist', 'mock'], file));
  const tools3 = (await client.listTools()).tools.map(t => t.name);
  must(tools3.includes('assist_suggest') && tools3.includes('assist_members') && tools3.includes('assist_status'), 'assist tools missing');
  const st = JSON.parse(await call('assist_status', {})); must(st.provider === 'mock' && st.writes === 'proposals only', 'assist_status');
  await call('need_set', { need: 'Heater power stays within the kettle power budget', short: 'Power budget', source: 'Engineering', importance: 3, by: 'Engineering' });
  const before = JSON.parse(await call('house_get', { part: 'room' }));
  const sg = await call('assist_suggest', { limit: 6 });
  must(sg.includes('proposal') && sg.includes('mock'), 'assist_suggest: ' + sg.slice(0, 120));
  const after3 = JSON.parse(await call('house_get', { part: 'room' }));
  must(JSON.stringify(before) === JSON.stringify(after3), 'assist must not change the room');
  const pend = JSON.parse(await call('proposals_list', {}));
  must(pend.length >= 1 && pend.every(p => p.by.startsWith('assist:')), 'assist proposals carry the assist actor: ' + JSON.stringify(pend.map(p => p.by)));
  const mem = await call('assist_members', { kind: 'needs', text: 'Customers said the kettle must switch off by itself when the water boils. Several asked for a lid that opens with one hand. One wanted it to be quiet before seven in the morning.' });
  must(mem.includes('proposed needs'), 'assist_members: ' + mem.slice(0, 100));
  const pend2 = JSON.parse(await call('proposals_list', {}));
  const needProp = pend2.find(p => p.kind === 'need'); must(needProp && needProp.evidence, 'a need proposal with its excerpt');
  const cf = await call('proposal_confirm', { id: needProp.id, confirmedBy: 'John' });
  must(cf.startsWith('Confirmed'), 'confirm a proposed need');
  const needs3 = JSON.parse(await call('house_get', { part: 'needs' })); must(needs3.length === 5, 'confirmed need was added: ' + needs3.length);
  must(cf.includes('(added as W') && cf.includes('Warning:') && cf.includes('importance'), 'confirm names the new id and flags the defaulted scores: ' + cf.slice(0, 220));
  const pn = await call('propose', { kind: 'characteristic', value: 'Lid opening force', fields: { unit: 'N', direction: 'down' }, note: 'from the notes' });
  must(pn.startsWith('Proposed') && pn.includes('new characteristic: Lid opening force (N)'), 'propose a whole characteristic through the tool: ' + pn.slice(0, 120));
  const empty = await call('assist_suggest', { cells: [{ need: 'W1', characteristic: 'H1' }] });
  must(empty.includes('Nothing was recorded') && empty.includes('1 cell skipped'), 'assist_suggest on a set cell records nothing: ' + empty.slice(0, 160));
  await client.close();
  console.log('assist (mock) ok');
  console.log('ALL OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
