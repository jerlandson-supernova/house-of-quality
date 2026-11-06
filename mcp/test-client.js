#!/usr/bin/env node
/* Exercises the MCP server end to end over stdio: builds a small house, reads it back, exports it. Run: npm test */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoq-mcp-'));
  const file = path.join(dir, 'house.json');
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, 'server.js'), '--file', file] });
  const client = new Client({ name: 'hoq-test', version: '0.0.1' });
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map(t => t.name);
  console.log('tools:', names.join(', '));
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args || {} }); const t = r.content.map(c => c.text).join('\n'); if (r.isError) throw new Error(name + ': ' + t); return t; };
  const must = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

  console.log(await call('house_new', { title: 'Test kettle', date: '2026-11-05', todayLabel: 'prototype' }));
  await call('need_set', { need: 'Boils a litre in under three minutes', short: 'Fast boil', source: 'Survey', importance: 5, today: 2, goal: 5, links: 'K-1' });
  await call('need_set', { need: 'Does not scald the hand on the lid', short: 'Safe lid', source: 'Safety review', importance: 5, today: 3, goal: 5, links: 'K-2' });
  await call('need_set', { need: 'Costs under thirty', short: 'Cheap', source: 'Pricing', importance: 3, today: 4, goal: 4, links: 'K-3' });
  await call('characteristic_set', { name: 'Heater power', unit: 'W', direction: '↑', target: '≥ 2400 W', today: '1800 W', links: 'K-1' });
  await call('characteristic_set', { name: 'Lid surface temperature at boil', unit: '°C', direction: '↓', target: '≤ 45', today: '58', gate: true, links: 'K-2' });
  await call('characteristic_set', { name: 'Unit cost', unit: '$', direction: '↓', target: '≤ 12', today: '14', links: 'K-3' });
  const many = await call('relationships_set_many', { cells: [{ need: 'W1', characteristic: 'H1', value: 9 }, { need: 'W2', characteristic: 'H2', value: 'strong' }, { need: 'W3', characteristic: 'H3', value: 9 }, { need: 'W3', characteristic: 'H1', value: 3 }, { need: 'W2', characteristic: 'H1', value: 1 }] });
  must(many.startsWith('5 cells set'), 'relationships_set_many: ' + many);
  await call('roof_set', { a: 'H1', b: 'H3', value: '--' });
  await call('item_set', { key: 'K-1', title: 'Bigger element', status: 'In Progress', due: '2026-11-20', effort: 3, tested: 'partial' });
  await call('item_set', { key: 'K-2', title: 'Double-wall lid', status: 'Done', due: '2026-10-30', effort: 2, tested: 'verified' });
  const pr = JSON.parse(await call('house_priorities', {}));
  console.log('priorities:', pr.characteristics.map(c => `${c.id} ${c.weight} ${c.rank}`).join(' · '));
  must(pr.characteristics[0].id === 'H1' && pr.characteristics.find(c => c.id === 'H2').rank === 'gate', 'priorities wrong');
  const dg = JSON.parse(await call('house_diagonal', {}));
  console.log('diagonal:', dg.blocks.map(b => `${b.block}: ${b.needs.join(' ')} × ${b.characteristics.join(' ')}`).join(' · '), '·', dg.coupling.strongOnly.verdict, '/', dg.coupling.allLevels.verdict);
  const it = JSON.parse(await call('house_items', {}));
  console.log('items:', it.items.map(x => `${x.key} ${x.share}% ${x.status} → ${x.reallyDone}`).join(' · '), '· right wall', Math.round(it.progress.rightWall * 100) + '%');
  must(it.items.find(x => x.key === 'K-2').reallyDone === 'holds', 'reallyDone wrong');
  const svg = await call('house_draw', { reduce: true });
  must(svg.startsWith('<svg') && svg.includes('Fast boil'), 'svg wrong');
  console.log(await call('house_export', { format: 'tsv', path: path.join(dir, 'house.tsv') }));
  console.log(await call('house_export', { format: 'csv', path: path.join(dir, 'csv') }));
  const v = JSON.parse(await call('house_validate', {}));
  must(v.errors.length === 0, 'validate: ' + v.errors.join(' '));
  const res = await client.readResource({ uri: 'hoq://report' });
  must(res.contents[0].text.includes('Test kettle'), 'resource wrong');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  must(saved.needs.length === 3 && saved.characteristics.length === 3 && saved.roof['H1|H3'] === '−−', 'autosave wrong');
  console.log('report resource ok, autosaved file ok:', file);
  await client.close();
  console.log('ALL OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
