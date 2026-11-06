#!/usr/bin/env node
/* hoq-mcp — an MCP server so an agent can build, fill, query and export a House of Quality.
 *
 *   node mcp/server.js [--file house.json]      stdio transport; with --file the house is loaded from and saved to that file after every change
 *
 * Add it to Claude Code:   claude mcp add hoq -- node /path/to/house-of-quality/mcp/server.js --file ./house.json
 * The tools wrap web/hoq-core.js, the same code the page and the CLI run. docs/agent.md says how an agent should run a QFD session.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const H = require(path.join(__dirname, '..', 'web', 'hoq-core.js'));

const args = process.argv.slice(2);
let filePath = (() => { const i = args.indexOf('--file'); return i >= 0 ? path.resolve(args[i + 1]) : (process.env.HOQ_FILE ? path.resolve(process.env.HOQ_FILE) : null); })();
let house = H.blank();
if (filePath && fs.existsSync(filePath)) {
  const r = H.normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  if (!r.errors.length) house = r.house;
}

const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const fail = msg => ({ content: [{ type: 'text', text: msg }], isError: true });
const summary = () => `${house.title}: ${house.needs.length} needs, ${house.characteristics.length} characteristics, ${Object.values(house.relationships).reduce((s, r) => s + Object.values(r).filter(Boolean).length, 0)} relationships, ${Object.keys(house.roof).length} roof pairs, ${Object.keys(house.items).length} work items` + (filePath ? ` · saved to ${filePath}` : ' · not saved to a file yet (call house_save)');
function renorm() { const r = H.normalize(house); house = r.house; return r; }
function persist() { if (filePath) fs.writeFileSync(filePath, JSON.stringify(house, null, 2)); }
function after(msg) { const r = renorm(); persist(); return text(msg + '\n' + summary() + (r.warnings.length ? '\nWarnings: ' + r.warnings.join(' ') : '')); }
const C = mode => H.compute(house.needs, house.characteristics, house.relationships, { mode });
const relValue = v => { const s = String(v).trim().toLowerCase(); if (['strong', '9', '●'].includes(s)) return 9; if (['medium', '3', '○'].includes(s)) return 3; if (['weak', '1', '△'].includes(s)) return 1; if (['none', '0', '', 'blank'].includes(s)) return 0; return null; };
const roofValue = v => { const s = String(v).trim().replace(/--/g, '−−').replace(/^-$/, '−'); return H.ROOF_VALUES.includes(s) ? s : null; };
const nextId = (prefix, list) => { let n = list.length + 1; while (house.needs.some(x => x.id === prefix + n) || house.characteristics.some(x => x.id === prefix + n)) n++; return prefix + n; };

const server = new McpServer({ name: 'house-of-quality', version: '0.2.0' }, {
  instructions: 'Build and read a House of Quality (QFD). Start with house_new or house_open, add needs (rows, with a source and an importance 1 to 5) and characteristics (columns, with a unit, a direction and a target), set the room with relationship_set (9 strong, 3 medium, 1 weak), the roof with roof_set, then read house_priorities, house_diagonal and house_items. house_export writes the dated TSV, the CSV files, the JSON, an SVG drawing or the Excel workbook. Importance belongs to the stakeholders, gates are never ranked, and the dated TSV is the version of record. See docs/agent.md in the repository.' });

// ---------- the house ----------
server.registerTool('house_new', { title: 'Start a new house', description: 'Start an empty House of Quality with a title. Replaces the current house (save it first if it matters).',
  inputSchema: { title: z.string(), subtitle: z.string().optional(), date: z.string().optional().describe('YYYY-MM-DD the data is as of'), author: z.string().optional(), todayLabel: z.string().optional().describe('what "today" means, e.g. "current prototype"') } },
  async ({ title, subtitle, date, author, todayLabel }) => { house = H.blank(); house.title = title; house.subtitle = subtitle || ''; house.meta.date = date || ''; house.meta.author = author || ''; house.meta.todayLabel = todayLabel || 'today'; return after('New house started.'); });
server.registerTool('house_open', { title: 'Open a house file', description: 'Load a house from a JSON file (or a folder of the five CSV files). Becomes the file that later changes are saved to.',
  inputSchema: { path: z.string() } },
  async ({ path: p }) => { p = path.resolve(p);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) { const tables = {}; fs.readdirSync(p).filter(f => f.toLowerCase().endsWith('.csv')).forEach(f => { const rows = H.parseCSV(fs.readFileSync(path.join(p, f), 'utf8')); const kind = H.classifyCSV(rows, f); if (kind) tables[kind] = rows; });
      const base = fs.existsSync(path.join(p, 'house.json')) ? JSON.parse(fs.readFileSync(path.join(p, 'house.json'), 'utf8')) : {}; const r = H.fromCSV(tables, base); if (r.errors.length) return fail('Not loaded: ' + r.errors.join(' ')); house = r.house; filePath = path.join(p, 'house.json'); return after('Loaded ' + Object.keys(tables).join(', ') + ' from ' + p + '.'); }
    if (!fs.existsSync(p)) return fail('No such file: ' + p);
    const r = H.normalize(JSON.parse(fs.readFileSync(p, 'utf8'))); if (r.errors.length) return fail('Not loaded: ' + r.errors.join(' ')); house = r.house; filePath = p; return after('Loaded ' + p + '.' + (r.warnings.length ? ' Warnings: ' + r.warnings.join(' ') : '')); });
server.registerTool('house_save', { title: 'Save the house', description: 'Write the house as JSON. With no path, writes to the file it was opened from or started with --file.',
  inputSchema: { path: z.string().optional() } },
  async ({ path: p }) => { if (p) filePath = path.resolve(p); if (!filePath) return fail('No file path: give one.'); persist(); return text('Saved ' + filePath + '.\n' + summary()); });
server.registerTool('house_summary', { title: 'Summary', description: 'Counts, title, date and where the house is saved.', inputSchema: {} }, async () => text(summary()));
server.registerTool('house_get', { title: 'Read part of the house', description: 'Return the house, or one part of it, as JSON.',
  inputSchema: { part: z.enum(['json', 'needs', 'characteristics', 'room', 'roof', 'items', 'meta', 'narrative']).default('json') } },
  async ({ part }) => text(part === 'json' ? house : part === 'room' ? house.relationships : part === 'meta' ? { title: house.title, subtitle: house.subtitle, meta: house.meta, statusScale: house.statusScale } : house[part]));
server.registerTool('house_validate', { title: 'Validate', description: 'Errors and warnings: duplicate ids, cells outside 9/3/1, needs nothing serves, characteristics that drive nothing.', inputSchema: {} },
  async () => { const r = H.normalize(house); return text({ errors: r.errors, warnings: r.warnings }); });

// ---------- rows and columns ----------
const needShape = { id: z.string().optional().describe('W1, W2… ; omit to add a new need'), need: z.string().optional().describe('the need in the stakeholder\'s words'), short: z.string().optional(), source: z.string().optional().describe('who said it'), importance: z.number().int().min(1).max(5).optional(), today: z.number().int().min(1).max(5).optional(), goal: z.number().int().min(1).max(5).optional(), links: z.string().optional().describe('work-item keys, e.g. "MUG-3, MUG-5"'), why: z.string().optional() };
server.registerTool('need_set', { title: 'Add or update a need (row)', description: 'Add a need, or update the given fields of an existing one by id.', inputSchema: needShape },
  async (a) => { let w = a.id ? house.needs.find(x => x.id === a.id) : null;
    if (!w) { if (a.id && house.characteristics.some(x => x.id === a.id)) return fail('Id ' + a.id + ' is a characteristic.'); if (!a.need) return fail('A new need needs the "need" text.'); w = { id: a.id || nextId('W', house.needs), need: '', short: '', source: '', importance: 3, today: 1, goal: 5, links: '', why: '' }; house.needs.push(w); house.relationships[w.id] = {}; }
    ['need', 'short', 'source', 'importance', 'today', 'goal', 'links', 'why'].forEach(f => { if (a[f] !== undefined) w[f] = a[f]; }); if (!w.short) w.short = w.need.slice(0, 48);
    return after('Need ' + w.id + ' set: ' + w.need); });
server.registerTool('need_remove', { title: 'Remove a need', description: 'Remove a need and its row of relationships.', inputSchema: { id: z.string() } },
  async ({ id }) => { const i = house.needs.findIndex(x => x.id === id); if (i < 0) return fail('No need ' + id); house.needs.splice(i, 1); delete house.relationships[id]; return after('Need ' + id + ' removed.'); });
const charShape = { id: z.string().optional().describe('H1, H2… ; omit to add a new characteristic'), name: z.string().optional().describe('the measurable characteristic'), short: z.string().optional(), unit: z.string().optional(), direction: z.string().optional().describe('↑ larger is better, ↓ smaller is better, ◎ meet the target (or up/down/target)'), target: z.string().optional(), targetShort: z.string().optional(), today: z.string().optional(), todayShort: z.string().optional(), links: z.string().optional(), difficulty: z.number().int().min(1).max(5).optional(), gate: z.boolean().optional().describe('true for a must-pass gate: kept out of the rank') };
server.registerTool('characteristic_set', { title: 'Add or update a characteristic (column)', description: 'Add a measurable characteristic, or update the given fields of an existing one by id.', inputSchema: charShape },
  async (a) => { let h = a.id ? house.characteristics.find(x => x.id === a.id) : null;
    if (!h) { if (a.id && house.needs.some(x => x.id === a.id)) return fail('Id ' + a.id + ' is a need.'); if (!a.name) return fail('A new characteristic needs the "name".'); h = { id: a.id || nextId('H', house.characteristics), name: '', short: '', unit: '', direction: '↑', target: '', targetShort: '', today: '', todayShort: '', links: '', difficulty: 3, gate: false }; house.characteristics.push(h); }
    ['name', 'short', 'unit', 'direction', 'target', 'targetShort', 'today', 'todayShort', 'links', 'difficulty', 'gate'].forEach(f => { if (a[f] !== undefined) h[f] = a[f]; }); if (!h.short) h.short = h.name.slice(0, 36);
    return after('Characteristic ' + h.id + ' set: ' + h.name); });
server.registerTool('characteristic_remove', { title: 'Remove a characteristic', description: 'Remove a characteristic, its column and its roof pairs.', inputSchema: { id: z.string() } },
  async ({ id }) => { const j = house.characteristics.findIndex(x => x.id === id); if (j < 0) return fail('No characteristic ' + id); house.characteristics.splice(j, 1); Object.values(house.relationships).forEach(r => { delete r[id]; }); Object.keys(house.roof).forEach(k => { if (k.split('|').includes(id)) delete house.roof[k]; }); return after('Characteristic ' + id + ' removed.'); });

// ---------- the room, the roof, the items ----------
server.registerTool('relationship_set', { title: 'Set a room cell', description: 'How strongly a characteristic drives a need: 9 (strong), 3 (medium), 1 (weak) or 0 (none). Words strong/medium/weak/none also work.',
  inputSchema: { need: z.string(), characteristic: z.string(), value: z.union([z.number(), z.string()]) } },
  async ({ need, characteristic, value }) => { const v = relValue(value); if (v === null) return fail('Value must be 9, 3, 1 or 0.'); if (!house.needs.some(w => w.id === need)) return fail('No need ' + need); if (!house.characteristics.some(h => h.id === characteristic)) return fail('No characteristic ' + characteristic);
    house.relationships[need] = house.relationships[need] || {}; if (v) house.relationships[need][characteristic] = v; else delete house.relationships[need][characteristic]; return after(`${need} × ${characteristic} = ${v || 'blank'}.`); });
server.registerTool('relationships_set_many', { title: 'Set many room cells', description: 'Set several cells in one call: a list of {need, characteristic, value}.',
  inputSchema: { cells: z.array(z.object({ need: z.string(), characteristic: z.string(), value: z.union([z.number(), z.string()]) })) } },
  async ({ cells }) => { const bad = []; cells.forEach(c => { const v = relValue(c.value); if (v === null || !house.needs.some(w => w.id === c.need) || !house.characteristics.some(h => h.id === c.characteristic)) { bad.push(c); return; } house.relationships[c.need] = house.relationships[c.need] || {}; if (v) house.relationships[c.need][c.characteristic] = v; else delete house.relationships[c.need][c.characteristic]; });
    return after(`${cells.length - bad.length} cells set.` + (bad.length ? ' Skipped: ' + JSON.stringify(bad) : '')); });
server.registerTool('roof_set', { title: 'Set a roof pair', description: 'How two characteristics help (++, +) or fight (−, −−) each other; empty string removes the pair.',
  inputSchema: { a: z.string(), b: z.string(), value: z.string().describe('"++", "+", "−" (or "-"), "−−" (or "--"), or "" to remove') } },
  async ({ a, b, value }) => { const v = roofValue(value); if (v === null) return fail('Value must be ++, +, −, −− or empty.'); if (a === b || !house.characteristics.some(h => h.id === a) || !house.characteristics.some(h => h.id === b)) return fail('Give two different characteristic ids.');
    const idx = {}; house.characteristics.forEach((h, j) => { idx[h.id] = j; }); const k = idx[a] < idx[b] ? a + '|' + b : b + '|' + a; if (v) house.roof[k] = v; else delete house.roof[k]; return after(`Roof ${k} = ${v || 'none'}.`); });
server.registerTool('item_set', { title: 'Add or update a work item', description: 'A ticket or task the links fields point at: status, due date, effort and your own test verdict.',
  inputSchema: { key: z.string(), title: z.string().optional(), status: z.string().optional(), due: z.string().optional().describe('YYYY-MM-DD'), effort: z.union([z.number(), z.string()]).optional(), tested: z.enum(['', 'verified', 'partial', 'failed', 'not built', 'not retested']).optional(), note: z.string().optional() } },
  async (a) => { const it = house.items[a.key] || { title: '', status: '', due: '', effort: '', tested: '', note: '' }; ['title', 'status', 'due', 'effort', 'tested', 'note'].forEach(f => { if (a[f] !== undefined) it[f] = String(a[f]); }); house.items[a.key] = it; return after('Item ' + a.key + ' set.'); });
server.registerTool('item_remove', { title: 'Remove a work item', description: 'Remove a work item by key.', inputSchema: { key: z.string() } },
  async ({ key }) => { if (!house.items[key]) return fail('No item ' + key); delete house.items[key]; return after('Item ' + key + ' removed.'); });
server.registerTool('status_scale_set', { title: 'Set the status weights', description: 'Map each work-item status to a progress weight from 0 to 1, e.g. {"To Do":0,"In Progress":0.35,"Done":1}.', inputSchema: { scale: z.record(z.number().min(0).max(1)) } },
  async ({ scale }) => { house.statusScale = scale; return after('Status weights set.'); });

// ---------- reading the house ----------
server.registerTool('house_report', { title: 'Plain-text report', description: 'Weights, ranks, gates, the diagonal order and blocks, items and progress, as text.', inputSchema: { mode: z.enum(['importance', 'gap']).default('importance') } },
  async ({ mode }) => text(H.report(house, { mode })));
server.registerTool('house_priorities', { title: 'Priorities', description: 'Characteristics by weighted importance: weight, share, rank (gates are not ranked), and the needs each one drives.', inputSchema: { mode: z.enum(['importance', 'gap']).default('importance') } },
  async ({ mode }) => { const c = C(mode); return text({ mode, characteristics: [...house.characteristics.keys()].sort((a, b) => c.abs[b] - c.abs[a]).map(j => { const h = house.characteristics[j]; return { id: h.id, name: h.name, weight: c.abs[j], share: Math.round(c.pct[j] * 1000) / 10, rank: c.gate[j] ? 'gate' : c.rank[j], gate: c.gate[j], target: h.target, today: h.today, drives: house.needs.filter(w => (house.relationships[w.id] || {})[h.id]).map(w => w.id + ':' + house.relationships[w.id][h.id]) }; }),
    needs: house.needs.map((w, i) => ({ id: w.id, short: w.short, importance: w.importance, today: w.today, goal: w.goal, ratio: Math.round(c.ratio[i] * 100) / 100, gapShare: Math.round(c.adjPct[i] * 1000) / 10 })) }); });
server.registerTool('house_diagonal', { title: 'Diagonal order, blocks and coupling', description: 'Reorder the room along its diagonal: the blocks (modules), the coupling verdict (uncoupled, decoupled, coupled), what crosses the blocks and the ties to cut. use="strong" counts only the 9s.',
  inputSchema: { use: z.enum(['all', 'strong']).default('all'), k: z.number().int().min(0).max(8).default(0).describe('number of blocks; 0 = choose by modularity') } },
  async ({ use, k }) => { if (house.needs.length < 2 || house.characteristics.length < 2) return fail('Needs at least two needs and two characteristics.');
    const r = H.diagonalize(H.relMatrix(house, use), { k, kMax: 8 }); const W = i => house.needs[i].id, X = j => house.characteristics[j].id; const tie = t => ({ need: W(t.i), characteristic: X(t.j), value: t.v });
    return text({ use, blocks: r.blocks.rowCuts.map((a0, bi) => ({ block: 'B' + (bi + 1), needs: r.rows.slice(a0, r.blocks.rowCuts[bi + 1] ?? r.n).map(W), characteristics: r.cols.slice(r.blocks.colCuts[bi], r.blocks.colCuts[bi + 1] ?? r.m).map(X) })),
      measures: { inBlock: r.after.inBlock, inBlockAsListed: r.before.inBlock, meanDistance: r.after.meanDist, meanDistanceAsListed: r.before.meanDist, modularityQ: r.after.Q, k: r.k },
      coupling: { strongOnly: { verdict: r.strong.verdict, crossing: r.strong.above.concat(r.strong.below).map(tie) }, allLevels: { verdict: r.all.verdict, oneWay: r.all.above.length, otherWay: r.all.below.length, tiesToCut: r.all.cut.map(tie) } },
      servingSeveralBlocks: r.perCol.filter(x => x.total && x.outside / x.total >= 0.25).map(x => ({ characteristic: X(x.j), outsideShare: Math.round(x.outside / x.total * 100) / 100, blocks: x.blocks.map(b => 'B' + (b + 1)) })),
      dependingOnSeveralBlocks: r.perRow.filter(x => x.total && x.outside / x.total >= 0.25).map(x => ({ need: W(x.i), outsideShare: Math.round(x.outside / x.total * 100) / 100, blocks: x.blocks.map(b => 'B' + (b + 1)) })),
      checks: { needsWithNoStrongDriver: house.needs.filter(w => !house.characteristics.some(h => (house.relationships[w.id] || {})[h.id] === 9)).map(w => w.id), characteristicsStronglyDrivingNothing: house.characteristics.filter(h => !house.needs.some(w => (house.relationships[w.id] || {})[h.id] === 9)).map(h => h.id), emptyNeeds: r.emptyRows.map(W), emptyCharacteristics: r.emptyCols.map(X) } }); });
server.registerTool('house_items', { title: 'Work items, shares and progress', description: 'Each item\'s share of the house, its status read against your test verdict, and the two progress measures.', inputSchema: {} },
  async () => { const c = C('importance'); const T = H.itemShares(house, c); const P = H.progress(house, c);
    return text({ progress: { rightWall: P.rightWall, statusWeighted: P.statusWeighted, coverage: P.coverage, counts: P.counts, pastDue: P.late, effortLeft: P.effortLeft, effortAll: P.effortAll, asOf: P.asOf },
      items: T.keys.map(k => { const it = house.items[k] || {}; return { key: k, title: it.title || '', share: T.shares[k] ? Math.round(T.shares[k] / T.total * 1000) / 10 : 0, serves: [...(T.chars[k] || []).map(h => h.id + (h.gate ? ' (gate)' : '')), ...(T.needs[k] || []).map(w => w.id)], status: it.status || '', due: it.due || '', effort: it.effort || '', tested: it.tested || '', reallyDone: H.reallyDone(house, it.status, it.tested)[0], note: it.note || '' }; }) }); });
server.registerTool('house_draw', { title: 'Draw the house as SVG', description: 'The house as an SVG drawing (roof, room, right wall, basement). reduce hides rows and columns with no relationship.',
  inputSchema: { reduce: z.boolean().default(false), symbols: z.boolean().default(true).describe('true: ● ○ △; false: 9 3 1'), path: z.string().optional().describe('write the SVG to this file instead of returning it') } },
  async ({ reduce, symbols, path: p }) => { const svg = H.toSVG(house, { reduce, symbols }); if (p) { fs.writeFileSync(path.resolve(p), svg); return text('Wrote ' + path.resolve(p)); } return text(svg); });
server.registerTool('house_export', { title: 'Export', description: 'Write the house as the dated TSV (the version of record), the five CSV files, JSON, an SVG drawing, or the Excel workbook (needs python3 and openpyxl).',
  inputSchema: { format: z.enum(['tsv', 'csv', 'json', 'svg', 'xlsx']), path: z.string().describe('file path, or a folder for csv'), mode: z.enum(['importance', 'gap']).default('importance') } },
  async ({ format, path: p, mode }) => { p = path.resolve(p); const c = C(mode);
    if (format === 'tsv') { fs.writeFileSync(p, H.toTSV(house, c)); return text('Wrote ' + p); }
    if (format === 'json') { fs.writeFileSync(p, JSON.stringify(house, null, 2)); return text('Wrote ' + p); }
    if (format === 'svg') { fs.writeFileSync(p, H.toSVG(house, { mode })); return text('Wrote ' + p); }
    if (format === 'csv') { fs.mkdirSync(p, { recursive: true }); const files = H.toCSV(house); Object.keys(files).forEach(f => fs.writeFileSync(path.join(p, f), files[f])); return text('Wrote ' + Object.keys(files).join(', ') + ' in ' + p); }
    const tmp = path.join(require('os').tmpdir(), 'hoq-' + Date.now() + '.json'); fs.writeFileSync(tmp, JSON.stringify(house));
    const r = spawnSync('python3', [path.join(__dirname, '..', 'tools', 'make_xlsx.py'), tmp, p].concat(mode === 'gap' ? ['--gap'] : []), { encoding: 'utf8', env: process.env }); fs.unlinkSync(tmp);
    if (r.status !== 0) return fail('make_xlsx.py failed: ' + (r.stderr || r.stdout || 'is openpyxl installed? pip install openpyxl'));
    return text((r.stdout || '').trim() || 'Wrote ' + p); });

// ---------- resources ----------
server.registerResource('house', 'hoq://house', { title: 'The current house as JSON', mimeType: 'application/json' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(house, null, 2) }] }));
server.registerResource('report', 'hoq://report', { title: 'The current house as a text report', mimeType: 'text/plain' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: H.report(house) }] }));
server.registerResource('drawing', 'hoq://drawing.svg', { title: 'The current house drawn as SVG', mimeType: 'image/svg+xml' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'image/svg+xml', text: H.toSVG(house) }] }));

// ---------- a prompt for running the session ----------
server.registerPrompt('qfd_session', { title: 'Run a House of Quality session', description: 'Guides an agent through building a house with a person: needs with sources, characteristics with units, the room, the roof, scores, gates, then the reading.',
  argsSchema: { product: z.string().describe('what the house is for') } },
  ({ product }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `We are building a House of Quality for: ${product}.
Work in this order, one step at a time, and confirm each step with me before the next.
1. Needs: ask who the stakeholders are, then list what each needs in their own words, with the source. Add each with need_set. Keep it under about sixteen.
2. Importance: ask me (or the stakeholder) for 1 to 5 per need. Never set it yourself. Record who set it and when in the need's "why".
3. Characteristics: for each need, what can be measured on the design that would show it is met? Unit, direction, a target a stranger could test, and where it stands today. Add with characteristic_set. Mark anything that must pass before shipping as a gate.
4. The room: for each pair, 9 if the characteristic decides whether the need is met, 3 for a clear influence, 1 for some, blank otherwise. Use relationships_set_many. Then house_validate and read the empty rows and columns back to me.
5. The roof: pairs that help or fight each other, with roof_set. Every trade-off is a decision for someone; say whose.
6. Today and goal: 1 to 5 per need, with need_set.
7. Reading: house_priorities (the top five and the gates), house_diagonal (the blocks, what crosses them, the build order), and if there are tickets, item_set per ticket then house_items.
8. house_export tsv with today's date: that file is the version of record. Then house_export svg for a picture.` } }] }));

const transport = new StdioServerTransport();
server.connect(transport).catch(e => { process.stderr.write(String(e) + '\n'); process.exit(1); });
