#!/usr/bin/env node
/* hoq-mcp — an MCP server so an agent can build, fill, query and export a House of Quality.
 *
 *   node mcp/server.js [--file house.json] [--actor NAME] [--direct] [--no-confirm]
 *
 *   --file F       load the house from F and save it there after every change; an append-only change log goes to F.log.jsonl
 *   --actor NAME   who the agent is in provenance and proposals (default "agent")
 *   --direct       let the agent write room cells and roof pairs directly (with provenance). Without it, those writes become
 *                  proposals that count in no number until a person confirms them, on the page or with proposal_confirm
 *   --no-confirm   remove proposal_confirm, so only a person on the page can confirm
 *   --anywhere     let the agent read and write files outside the house's folder (default: the folder of --file, or the current directory)
 *   --assist [P]   add the optional model-backed assist tools (assist_status, assist_suggest, assist_members). They only propose.
 *                  P names the provider (anthropic or mock) and beats HOQ_ASSIST_PROVIDER.
 *                  Provider HOQ_ASSIST_PROVIDER=anthropic (default; credentials from ANTHROPIC_API_KEY or `ant auth login`) or mock;
 *                  model HOQ_ASSIST_MODEL (default claude-opus-5-5); HOQ_ASSIST_MAX_CELLS (default 12); HOQ_ASSIST_TIMEOUT_MS per request
 *                  (default 50000) and HOQ_ASSIST_RETRIES (default 1): keep attempts × timeout under the MCP client's request timeout (60 s by default).
 *
 * Add it to Claude Code:   claude mcp add hoq -- node /path/to/house-of-quality/mcp/server.js --file ./house.json
 * The tools wrap web/hoq-core.js, the same code the page and the CLI run. docs/agent.md says how an agent should run a session.
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
const argOf = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt; };
let filePath = argOf('--file', process.env.HOQ_FILE || null); if (filePath) filePath = path.resolve(filePath);
const ACTOR = argOf('--actor', process.env.HOQ_ACTOR || 'agent');
const DIRECT = args.includes('--direct');
const CAN_CONFIRM = !args.includes('--no-confirm');
const ANYWHERE = args.includes('--anywhere');
const envNum = (k, dflt) => { const v = Number(process.env[k]); return process.env[k] !== undefined && process.env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : dflt; };
let ASSIST = null;
if (args.includes('--assist')) {
  try { ASSIST = require(path.join(__dirname, 'assist.js')).createAssist({ provider: argOf('--assist', '') || process.env.HOQ_ASSIST_PROVIDER || 'anthropic', model: process.env.HOQ_ASSIST_MODEL, maxCells: envNum('HOQ_ASSIST_MAX_CELLS', 12) || 12, timeoutMs: envNum('HOQ_ASSIST_TIMEOUT_MS', 50000), maxRetries: envNum('HOQ_ASSIST_RETRIES', 1) }); }
  catch (e) { console.error('hoq: --assist: ' + e.message); process.exit(1); }
}
// Files the agent may read or write: inside the house's folder unless --anywhere. A refused path is an error the agent can read.
const baseDir = () => filePath ? path.dirname(filePath) : process.cwd();
function safePath(p) { const abs = path.resolve(p); if (ANYWHERE) return abs; const base = baseDir(); if (abs === base || abs.startsWith(base + path.sep)) return abs; throw new Error('Path ' + abs + ' is outside the house folder ' + base + '. Use a path inside it, or start the server with --anywhere.'); }
const logPath = () => filePath ? filePath.replace(/\.json$/i, '') + '.log.jsonl' : null;

let house = H.blank();
if (filePath && fs.existsSync(filePath)) {
  const r = H.normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  if (!r.errors.length) house = r.house;
}
const LOG = [];
function appendLog(op, summary, extra) {
  const line = Object.assign({ ts: new Date().toISOString(), actor: ACTOR, op, summary, revision: house.revision || 0 }, extra || {});
  LOG.push(line); if (LOG.length > 500) LOG.shift();
  const p = logPath(); if (p) { try { fs.appendFileSync(p, JSON.stringify(line) + '\n'); } catch (e) { /* the log is best effort */ } }
}

const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const fail = msg => ({ content: [{ type: 'text', text: msg }], isError: true });
const relCount = () => Object.values(house.relationships).reduce((s, r) => s + Object.values(r).filter(Boolean).length, 0);
const summary = () => `${house.title}: ${house.needs.length} needs, ${house.characteristics.length} characteristics, ${relCount()} relationships, ${Object.keys(house.roof).length} roof pairs, ${Object.keys(house.items).length} work items, ${(house.proposals || []).length} proposals pending, revision ${house.revision || 0}` + (filePath ? ` · saved to ${filePath}` : ' · not saved to a file yet (call house_save)');
function renorm() { const r = H.normalize(house); house = r.house; return r; }
function persist() { if (filePath) fs.writeFileSync(filePath, JSON.stringify(house, null, 2)); }
function after(op, msg, extra) { const r = renorm(); house.revision = (house.revision || 0) + 1; persist(); appendLog(op, msg, extra); return text(msg + '\n' + summary() + (r.warnings.length ? '\nWarnings: ' + r.warnings.join(' ') : '')); }
const C = mode => H.compute(house.needs, house.characteristics, house.relationships, { mode });
const relValue = v => { const s = String(v).trim().toLowerCase(); if (['strong', '9', '●'].includes(s)) return 9; if (['medium', '3', '○'].includes(s)) return 3; if (['weak', '1', '△'].includes(s)) return 1; if (['none', '0', '', 'blank'].includes(s)) return 0; return null; };
const roofValue = v => { const s = String(v).trim().replace(/--/g, '−−').replace(/^-$/, '−'); return H.ROOF_VALUES.includes(s) ? s : null; };
const nextId = prefix => H.nextFreeId(house, prefix);
const CONFIRM_HINT = 'It counts in no number until a person confirms it, on the page (Input tab, Proposals) or with proposal_confirm.';

const server = new McpServer({ name: 'house-of-quality', version: '0.4.0' }, {
  instructions: `${ASSIST ? 'The assist tools (assist_suggest, assist_members) ask a model for suggestions; everything they return is a proposal for a person to confirm. ' : ''}Build and read a House of Quality (QFD). Start with house_new or house_open; add needs (rows: the stakeholder's words, a source, an importance 1 to 5 that the stakeholder gives) and characteristics (columns: a unit, a direction, a target); then the room with relationship_set (9 strong, 3 medium, 1 weak) and the roof with roof_set. ${DIRECT ? 'This server lets you write cells and roof pairs directly; say in "note" why and in "evidence" on what.' : 'Cells and roof pairs you set become proposals: a person confirms them on the page or with proposal_confirm (give the person\'s name). Use house_next to find the cells worth proposing.'} Read house_priorities, house_diagonal and house_items; house_markdown is the report to hand to a person; house_export writes the dated TSV, the version of record. Work items: item_set records a ticket with the owner's test verdict (verified, partial, fails or not built) and the date of that test (retested); items_import refreshes statuses from a tracker export (a Jira CSV or its rows) and never touches the verdicts; house_items then says where the board and the tests disagree, what is overdue and which gates are clear. Importance belongs to the stakeholders, gates are never ranked. See docs/agent.md in the repository.` });

// ---------- the house ----------
server.registerTool('house_new', { title: 'Start a new house', description: 'Start an empty House of Quality with a title. Replaces the current house (save it first if it matters).',
  inputSchema: { title: z.string(), subtitle: z.string().optional(), date: z.string().optional().describe('YYYY-MM-DD the data is as of'), author: z.string().optional(), todayLabel: z.string().optional().describe('what "today" means, e.g. "current prototype"') } },
  async ({ title, subtitle, date, author, todayLabel }) => { house = H.blank(); house.title = title; house.subtitle = subtitle || ''; house.meta.date = date || ''; house.meta.author = author || ''; house.meta.todayLabel = todayLabel || 'today'; return after('house.new', 'New house started: ' + title); });
server.registerTool('house_open', { title: 'Open a house file', description: 'Load a house from a JSON file (or a folder of the five CSV files). Becomes the file that later changes are saved to.',
  inputSchema: { path: z.string() } },
  async ({ path: p }) => { try { p = safePath(p); } catch (e) { return fail(e.message); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) { const tables = {}; fs.readdirSync(p).filter(f => f.toLowerCase().endsWith('.csv')).forEach(f => { const rows = H.parseCSV(fs.readFileSync(path.join(p, f), 'utf8')); const kind = H.classifyCSV(rows, f); if (kind) tables[kind] = rows; });
      const base = fs.existsSync(path.join(p, 'house.json')) ? JSON.parse(fs.readFileSync(path.join(p, 'house.json'), 'utf8')) : {}; const r = H.fromCSV(tables, base); if (r.errors.length) return fail('Not loaded: ' + r.errors.join(' ')); house = r.house; filePath = path.join(p, 'house.json'); appendLog('house.open', 'Loaded CSV from ' + p); return text('Loaded ' + Object.keys(tables).join(', ') + ' from ' + p + '.\n' + summary()); }
    if (!fs.existsSync(p)) return fail('No such file: ' + p);
    const r = H.normalize(JSON.parse(fs.readFileSync(p, 'utf8'))); if (r.errors.length) return fail('Not loaded: ' + r.errors.join(' ')); house = r.house; filePath = p; appendLog('house.open', 'Loaded ' + p); return text('Loaded ' + p + '.' + (r.warnings.length ? ' Warnings: ' + r.warnings.join(' ') : '') + '\n' + summary()); });
server.registerTool('house_save', { title: 'Save the house', description: 'Write the house as JSON. With no path, writes to the file it was opened from or started with --file.',
  inputSchema: { path: z.string().optional() } },
  async ({ path: p }) => { if (p) { try { filePath = safePath(p); } catch (e) { return fail(e.message); } } if (!filePath) return fail('No file path: give one.'); persist(); appendLog('house.save', 'Saved ' + filePath); return text('Saved ' + filePath + '.\n' + summary()); });
server.registerTool('house_summary', { title: 'Summary', description: 'Counts, title, date, pending proposals, revision and where the house is saved.', inputSchema: {} }, async () => text(summary()));
server.registerTool('house_get', { title: 'Read part of the house', description: 'Return the house, or one part of it, as JSON.',
  inputSchema: { part: z.enum(['json', 'needs', 'characteristics', 'room', 'roof', 'items', 'meta', 'narrative', 'provenance', 'proposals']).default('json') } },
  async ({ part }) => text(part === 'json' ? house : part === 'room' ? house.relationships : part === 'meta' ? { title: house.title, subtitle: house.subtitle, meta: house.meta, statusScale: house.statusScale, revision: house.revision } : house[part]));
server.registerTool('house_validate', { title: 'Validate', description: 'Errors and warnings: duplicate ids, cells outside 9/3/1, needs nothing serves, characteristics that drive nothing.', inputSchema: {} },
  async () => { const r = H.normalize(house); return text({ errors: r.errors, warnings: r.warnings }); });
server.registerTool('house_log', { title: 'Change log', description: 'The append-only log of accepted changes: who did what, when, at which revision. With --file it is also on disk as <file>.log.jsonl.', inputSchema: { limit: z.number().int().min(1).max(500).default(50) } },
  async ({ limit }) => { const p = logPath(); let lines = LOG; if (p && fs.existsSync(p)) { try { lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { /* fall back to memory */ } } return text(lines.slice(-limit)); });

// ---------- rows and columns ----------
const who = z.string().optional().describe('who gave this value (a stakeholder\'s name, a document); recorded as provenance');
const needShape = { id: z.string().optional().describe('W1, W2… ; omit to add a new need'), need: z.string().optional().describe('the need in the stakeholder\'s words'), short: z.string().optional(), source: z.string().optional().describe('who said it'), importance: z.number().int().min(1).max(5).optional(), today: z.number().int().min(1).max(5).optional(), goal: z.number().int().min(1).max(5).optional(), links: z.string().optional().describe('work-item keys, e.g. "MUG-3, MUG-5"'), why: z.string().optional(), by: who, note: z.string().optional() };
server.registerTool('need_set', { title: 'Add or update a need (row)', description: 'Add a need, or update the given fields of an existing one by id. Importance, today and goal are recorded with who gave them ("by"): they belong to the stakeholders, never to the agent.', inputSchema: needShape },
  async (a) => { let w = a.id ? house.needs.find(x => x.id === a.id) : null;
    if (!w) { if (a.id && house.characteristics.some(x => x.id === a.id)) return fail('Id ' + a.id + ' is a characteristic.'); if (!a.need) return fail('A new need needs the "need" text.'); w = { id: a.id || nextId('W'), need: '', short: '', source: '', importance: 3, today: 1, goal: 5, links: '', why: '' }; house.needs.push(w); house.relationships[w.id] = {}; }
    ['need', 'short', 'source', 'importance', 'today', 'goal', 'links', 'why'].forEach(f => { if (a[f] !== undefined) w[f] = a[f]; }); if (!w.short) w.short = w.need.slice(0, 48);
    ['importance', 'today', 'goal'].forEach(f => { if (a[f] !== undefined) H.setProvenance(house, f, w.id, null, a[f], { by: a.by || ACTOR, note: a.note }); });
    return after('need.set', 'Need ' + w.id + ' set: ' + w.need, { id: w.id }); });
server.registerTool('need_remove', { title: 'Remove a need', description: 'Remove a need and its row of relationships.', inputSchema: { id: z.string() } },
  async ({ id }) => { const i = house.needs.findIndex(x => x.id === id); if (i < 0) return fail('No need ' + id); house.needs.splice(i, 1); delete house.relationships[id]; return after('need.remove', 'Need ' + id + ' removed.', { id }); });
const charShape = { id: z.string().optional().describe('H1, H2… ; omit to add a new characteristic'), name: z.string().optional().describe('the measurable characteristic'), short: z.string().optional(), unit: z.string().optional(), direction: z.string().optional().describe('↑ larger is better, ↓ smaller is better, ◎ meet the target (or up/down/target)'), target: z.string().optional(), targetShort: z.string().optional(), today: z.string().optional(), todayShort: z.string().optional(), links: z.string().optional(), difficulty: z.number().int().min(1).max(5).optional(), gate: z.boolean().optional().describe('true for a must-pass gate: kept out of the rank') };
server.registerTool('characteristic_set', { title: 'Add or update a characteristic (column)', description: 'Add a measurable characteristic, or update the given fields of an existing one by id.', inputSchema: charShape },
  async (a) => { let h = a.id ? house.characteristics.find(x => x.id === a.id) : null;
    if (!h) { if (a.id && house.needs.some(x => x.id === a.id)) return fail('Id ' + a.id + ' is a need.'); if (!a.name) return fail('A new characteristic needs the "name".'); h = { id: a.id || nextId('H'), name: '', short: '', unit: '', direction: '↑', target: '', targetShort: '', today: '', todayShort: '', links: '', difficulty: 3, gate: false }; house.characteristics.push(h); }
    ['name', 'short', 'unit', 'direction', 'target', 'targetShort', 'today', 'todayShort', 'links', 'difficulty', 'gate'].forEach(f => { if (a[f] !== undefined) h[f] = a[f]; }); if (!h.short) h.short = h.name.slice(0, 36);
    return after('characteristic.set', 'Characteristic ' + h.id + ' set: ' + h.name, { id: h.id }); });
server.registerTool('characteristic_remove', { title: 'Remove a characteristic', description: 'Remove a characteristic, its column and its roof pairs.', inputSchema: { id: z.string() } },
  async ({ id }) => { const j = house.characteristics.findIndex(x => x.id === id); if (j < 0) return fail('No characteristic ' + id); house.characteristics.splice(j, 1); Object.values(house.relationships).forEach(r => { delete r[id]; }); Object.keys(house.roof).forEach(k => { if (k.split('|').includes(id)) delete house.roof[k]; }); return after('characteristic.remove', 'Characteristic ' + id + ' removed.', { id }); });

// ---------- the room and the roof: direct with provenance, or proposals ----------
const evidenceShape = { note: z.string().optional().describe('why this value: the reasoning in one line'), evidence: z.string().optional().describe('what it rests on: a quote, a document, a measurement, a file') };
function setCell(need, characteristic, value, note, evidence) {
  const v = relValue(value); if (v === null) return 'Value must be 9, 3, 1 or 0.'; if (!house.needs.some(w => w.id === need)) return 'No need ' + need; if (!house.characteristics.some(h => h.id === characteristic)) return 'No characteristic ' + characteristic;
  if (!DIRECT) { const r = H.propose(house, { kind: 'cell', need, characteristic, value: v, by: ACTOR, note, evidence }); return r.error || { proposed: r.proposal }; }
  house.relationships[need] = house.relationships[need] || {}; if (v) house.relationships[need][characteristic] = v; else delete house.relationships[need][characteristic];
  H.setProvenance(house, 'cell', need, characteristic, v, { by: ACTOR, note, evidence }); return { set: v };
}
server.registerTool('relationship_set', { title: 'Set a room cell', description: 'How strongly a characteristic drives a need: 9 (strong), 3 (medium), 1 (weak) or 0 (none); words strong/medium/weak/none also work. ' + (DIRECT ? 'Written directly, with provenance.' : 'Becomes a proposal for a person to confirm.'),
  inputSchema: Object.assign({ need: z.string(), characteristic: z.string(), value: z.union([z.number(), z.string()]) }, evidenceShape) },
  async ({ need, characteristic, value, note, evidence }) => { const r = setCell(need, characteristic, value, note, evidence); if (typeof r === 'string') return fail(r);
    if (r.proposed) return after('cell.propose', `Proposed ${r.proposed.id}: ${H.describeProposal(r.proposed)}. ${CONFIRM_HINT}`, { id: r.proposed.id });
    return after('cell.set', `${need} × ${characteristic} = ${r.set || 'blank'}.`); });
server.registerTool('relationships_set_many', { title: 'Set many room cells', description: 'Set several cells in one call: a list of {need, characteristic, value, note?, evidence?}. ' + (DIRECT ? 'Written directly.' : 'Each becomes a proposal.'),
  inputSchema: { cells: z.array(z.object(Object.assign({ need: z.string(), characteristic: z.string(), value: z.union([z.number(), z.string()]) }, evidenceShape))) } },
  async ({ cells }) => { const bad = [], ids = []; let n = 0; cells.forEach(c => { const r = setCell(c.need, c.characteristic, c.value, c.note, c.evidence); if (typeof r === 'string') bad.push(Object.assign({ error: r }, c)); else { n++; if (r.proposed) ids.push(r.proposed.id); } });
    return after(DIRECT ? 'cells.set' : 'cells.propose', (DIRECT ? `${n} cells set.` : `${n} proposals made (${ids.join(', ')}). ${CONFIRM_HINT}`) + (bad.length ? ' Skipped: ' + JSON.stringify(bad) : '')); });
server.registerTool('roof_set', { title: 'Set a roof pair', description: 'How two characteristics help (++, +) or fight (−, −−) each other; empty string removes the pair. ' + (DIRECT ? 'Written directly, with provenance.' : 'Becomes a proposal for a person to confirm.'),
  inputSchema: Object.assign({ a: z.string(), b: z.string(), value: z.string().describe('"++", "+", "−" (or "-"), "−−" (or "--"), or "" to remove') }, evidenceShape) },
  async ({ a, b, value, note, evidence }) => { const v = roofValue(value); if (v === null) return fail('Value must be ++, +, −, −− or empty.'); if (a === b || !house.characteristics.some(h => h.id === a) || !house.characteristics.some(h => h.id === b)) return fail('Give two different characteristic ids.');
    if (!DIRECT) { const r = H.propose(house, { kind: 'roof', a, b, value: v, by: ACTOR, note, evidence }); if (r.error) return fail(r.error); return after('roof.propose', `Proposed ${r.proposal.id}: ${H.describeProposal(r.proposal)}. ${CONFIRM_HINT}`, { id: r.proposal.id }); }
    const k = H.provKey(house, 'roof', a, b).slice(5); if (v) house.roof[k] = v; else delete house.roof[k]; H.setProvenance(house, 'roof', a, b, v, { by: ACTOR, note, evidence }); return after('roof.set', `Roof ${k} = ${v || 'none'}.`); });

// ---------- proposals ----------
server.registerTool('propose', { title: 'Propose a value', description: 'Suggest something for a person to confirm: a room cell, a roof pair, a need\'s importance, today or goal, or a whole new need or characteristic (kind need or characteristic, with its fields in the data format\'s names: need or name, short, source, unit, direction, target, importance, today, goal…; the id is assigned on confirmation). Counts in no number until confirmed.',
  inputSchema: Object.assign({ kind: z.enum(H.PROPOSAL_KINDS), need: z.string().optional(), characteristic: z.string().optional(), a: z.string().optional(), b: z.string().optional(), value: z.union([z.number(), z.string()]).optional().describe('the cell, roof or score value; for a need or characteristic, its text when not in fields'), fields: z.record(z.string(), z.any()).optional().describe('for kind need or characteristic: the row or column to add') }, evidenceShape) },
  async (p) => { const r = H.propose(house, Object.assign({}, p, { by: ACTOR })); if (r.error) return fail(r.error); return after('propose', `Proposed ${r.proposal.id}: ${H.describeProposal(r.proposal)}${r.replaced ? ' (replaces an earlier proposal of yours for the same value)' : ''}. ${CONFIRM_HINT}`, { id: r.proposal.id }); });
server.registerTool('proposals_list', { title: 'Proposals awaiting confirmation', description: 'Every proposed value not yet confirmed or rejected.', inputSchema: {} },
  async () => text((house.proposals || []).map(p => Object.assign({ what: H.describeProposal(p) }, p))));
if (CAN_CONFIRM) server.registerTool('proposal_confirm', { title: 'Confirm a proposal (a person\'s decision)', description: 'Apply a proposed value. Only call this when the person has said so in the conversation; give their name as confirmedBy. The provenance keeps both who proposed and who confirmed.',
  inputSchema: { id: z.string(), confirmedBy: z.string().min(1).describe('the person who confirmed, by name') } },
  async ({ id, confirmedBy }) => { if (confirmedBy.trim().toLowerCase() === ACTOR.toLowerCase()) return fail('confirmedBy must be a person, not the agent.'); const r = H.confirmProposal(house, id, confirmedBy); if (r.error) return fail(r.error); return after('proposal.confirm', `Confirmed ${id} by ${confirmedBy}: ${H.describeProposal(r.applied)}${r.added ? ' (added as ' + r.added.id + ')' : ''}.` + (r.dropped.length ? ` Other proposals for the same value dropped: ${r.dropped.join(', ')}.` : '') + (r.warning ? ` Warning: ${r.warning}` : ''), { id, confirmedBy, added: r.added ? r.added.id : undefined }); });
server.registerTool('proposal_reject', { title: 'Reject a proposal', description: 'Drop a proposed value, with a reason for the log.', inputSchema: { id: z.string(), reason: z.string().optional() } },
  async ({ id, reason }) => { const r = H.rejectProposal(house, id); if (r.error) return fail(r.error); return after('proposal.reject', `Rejected ${id}: ${H.describeProposal(r.rejected)}.${reason ? ' ' + reason : ''}`, { id, reason }); });
server.registerTool('house_next', { title: 'What to fill next', description: 'The empty cells worth looking at, ranked: needs nothing serves, needs with no strong driver, characteristics driving nothing, then by weight. Most cells of a good house stay blank, so this names the structural gaps, not every empty cell.',
  inputSchema: { limit: z.number().int().min(1).max(50).default(10) } },
  async ({ limit }) => text(H.nextCells(house, limit)));

// ---------- optional assist: a model suggests, a person confirms ----------
if (ASSIST) {
  const assistActor = 'assist:' + ASSIST.model;
  server.registerTool('assist_status', { title: 'Assist status', description: 'Which provider and model the assist uses, and its limits. The assist only proposes; nothing it says counts until a person confirms it.', inputSchema: {} },
    async () => text({ provider: ASSIST.provider, model: ASSIST.model, maxCellsPerCall: ASSIST.maxCells, timeoutMs: ASSIST.timeoutMs, maxRetries: ASSIST.maxRetries, actor: assistActor, writes: 'proposals only' }));
  server.registerTool('assist_suggest', { title: 'Ask the model to suggest cell values', description: 'For the empty cells worth looking at (house_next, or the cells you name), ask the model for 9/3/1/0 with a one-line reason. Each non-blank suggestion becomes a proposal for a person to confirm; blanks are reported, not recorded. Bounded to maxCellsPerCall.',
    inputSchema: { cells: z.array(z.object({ need: z.string(), characteristic: z.string() })).optional().describe('cells to rate; default: the top cells from house_next'), limit: z.number().int().min(1).max(50).optional() } },
    async ({ cells, limit }) => { try { const r = await ASSIST.suggest(house, cells || (limit ? H.nextCells(house, limit).cells.map(c => ({ need: c.need, characteristic: c.characteristic })) : null), assistActor);
      const msg = `${r.proposed.length} proposal${r.proposed.length === 1 ? '' : 's'} from ${ASSIST.model}: ${r.proposed.map(p => p.id + ' ' + H.describeProposal(p) + (p.note ? ' (' + p.note + ')' : '')).join('; ') || 'none'}.` + (r.blank && r.blank.length ? ` Suggested blank: ${r.blank.join(', ')}.` : '') + (r.skipped ? ` ${r.skipped} cell${r.skipped === 1 ? '' : 's'} skipped (already set, or unknown ids).` : '') + (r.dropped ? ` ${r.dropped} unusable answers dropped.` : '') + ` Usage: ${JSON.stringify(r.usage)}.`;
      return r.proposed.length ? after('assist.suggest', msg + ' ' + CONFIRM_HINT, { usage: r.usage }) : text(msg + ' Nothing was recorded.'); }
      catch (e) { return fail('assist_suggest failed: ' + e.message); } });
  server.registerTool('assist_members', { title: 'Ask the model to extract needs or characteristics from text', description: 'Give it interview notes, a survey, a review or a spec; it proposes needs (in the source\'s words, with the excerpt) or characteristics (only ones with a unit). Each becomes a proposal for a person to confirm.',
    inputSchema: { kind: z.enum(['needs', 'characteristics']), text: z.string().min(10).describe('the source text, up to about 20,000 characters') } },
    async ({ kind, text: src }) => { try { const r = await ASSIST.members(house, kind, src, assistActor);
      const msg = `${r.proposed.length} proposed ${kind} from ${ASSIST.model}: ${r.proposed.map(p => p.id + ' ' + H.describeProposal(p)).join('; ') || 'none'}. Usage: ${JSON.stringify(r.usage)}.`;
      return r.proposed.length ? after('assist.members', msg + ' ' + CONFIRM_HINT, { usage: r.usage }) : text(msg + ' Nothing was recorded.'); }
      catch (e) { return fail('assist_members failed: ' + e.message); } });
}

// ---------- items ----------
server.registerTool('item_set', { title: 'Add or update a work item', description: 'A ticket or task the links fields point at: status, due date and effort (from the tracker), your own test verdict (verified, partial, fails, not built) and the date you tested it (retested). Only set tested from evidence you have seen.',
  inputSchema: { key: z.string(), title: z.string().optional(), status: z.string().optional(), due: z.string().optional().describe('YYYY-MM-DD'), effort: z.union([z.number(), z.string()]).optional(),
    tested: z.enum(['', 'verified', 'partial', 'fails', 'not built', 'failed', 'not retested']).optional().describe('the verdict; "failed" is read as fails, "not retested" is no longer a verdict and is dropped with a warning (put the date in retested)'),
    retested: z.string().optional().describe('YYYY-MM-DD: the date of the test the verdict comes from'), updated: z.string().optional().describe('when the tracker last changed the item (ISO date-time); after retested it marks the item as changed since the test'),
    resolved: z.string().optional(), priority: z.string().optional(), sprint: z.string().optional(), note: z.string().optional() } },
  async (a) => { const it = house.items[a.key] || { title: '', status: '', due: '', effort: '', tested: '', retested: '', updated: '', resolved: '', priority: '', sprint: '', note: '' }; ['title', 'status', 'due', 'effort', 'tested', 'retested', 'updated', 'resolved', 'priority', 'sprint', 'note'].forEach(f => { if (a[f] !== undefined) it[f] = String(a[f]); }); house.items[a.key] = it;
    const tv = H.testedValue(it.tested); const note = tv.dropped === 'not retested' ? ' "not retested" is not a verdict: tested was left empty; set retested to the date of the last test.' : tv.value && tv.value !== String(it.tested).toLowerCase().trim() ? ` tested "${it.tested}" recorded as ${tv.value}.` : '';
    return after('item.set', 'Item ' + a.key + ' set.' + note, { key: a.key }); });
server.registerTool('items_import', { title: 'Refresh work items from a tracker export', description: 'Merge a tracker export into the work items: statuses, due dates, effort (story points), updated, resolved, priority and sprint are taken from the export; tested, retested and note are never touched. Give rows (records keyed by the export\'s column names) or csv (the export file\'s text, e.g. a Jira CSV). mapping "jira" reads Jira\'s column names (Issue key, Summary, Status, Due date, Updated, Resolved, Priority, Sprint, Custom field (Story point estimate)); "items" reads the house\'s own items.csv names; or give {field: column} yourself. add says which keys not yet in the house become items: "linked" (only keys a links field names, the default), "all", or "none". dryRun returns the changes without applying them. Statuses are facts from the tracker, so this writes directly; it is logged.',
  inputSchema: { rows: z.array(z.record(z.string(), z.any())).optional(), csv: z.string().optional(), mapping: z.union([z.enum(['jira', 'items']), z.record(z.string(), z.union([z.string(), z.array(z.string())]))]).default('jira'), add: z.enum(['linked', 'all', 'none']).default('linked'), source: z.string().optional().describe('where the export came from, e.g. "Jira export of 6 Nov"'), readAt: z.string().optional().describe('when the tracker was read (ISO); default now'), dryRun: z.boolean().default(false) } },
  async ({ rows, csv, mapping, add, source, readAt, dryRun }) => {
    if (!rows && !csv) return fail('Give rows or csv.');
    const recs = rows || H.records(H.parseCSV(csv)); if (!recs.length) return fail('The export has no rows.');
    const target = dryRun ? H.normalize(JSON.parse(JSON.stringify(house))).house : house;
    const r = H.importItems(target, recs, { mapping, add, source: source || 'tracker export', readAt });
    const lines = H.importText(r).join('\n');
    if (dryRun) return text('Dry run, nothing applied:\n' + lines + '\n' + JSON.stringify({ changes: r.changes, added: r.added, skipped: r.skipped, unknownStatuses: r.unknownStatuses }, null, 2));
    return after('items.import', `Statuses merged from ${r.source || 'the export'}: ${r.changes.length} change${r.changes.length === 1 ? '' : 's'}, ${r.added.length} added, ${r.unchanged.length} unchanged, ${r.skipped.length} skipped. Verdicts, retest dates and notes untouched.\n` + lines, { source: r.source, readAt: r.readAt, changes: r.changes, added: r.added.map(a => a.key), skipped: r.skipped.length, unknownStatuses: r.unknownStatuses }); });
server.registerTool('item_remove', { title: 'Remove a work item', description: 'Remove a work item by key.', inputSchema: { key: z.string() } },
  async ({ key }) => { if (!house.items[key]) return fail('No item ' + key); delete house.items[key]; return after('item.remove', 'Item ' + key + ' removed.', { key }); });
server.registerTool('status_scale_set', { title: 'Set the status weights', description: 'Map each work-item status to a progress weight from 0 to 1, e.g. {"To Do":0,"In Progress":0.35,"Done":1}.', inputSchema: { scale: z.record(z.number().min(0).max(1)) } },
  async ({ scale }) => { house.statusScale = scale; return after('statusScale.set', 'Status weights set.'); });

// ---------- reading the house ----------
server.registerTool('house_report', { title: 'Plain-text report', description: 'Weights, ranks, gates, the diagonal order and blocks, items and progress, as text.', inputSchema: { mode: z.enum(['importance', 'gap']).default('importance') } },
  async ({ mode }) => text(H.report(house, { mode })));
server.registerTool('house_markdown', { title: 'Markdown report', description: 'The whole house as Markdown: summary, needs, characteristics, the room, the roof, the diagonal blocks and coupling, work items, pending proposals, findings and provenance. The document to hand to a person or to read before advising.',
  inputSchema: { mode: z.enum(['importance', 'gap']).default('importance'), symbols: z.boolean().default(true).describe('true: ● ○ △; false: 9 3 1'), path: z.string().optional().describe('write it to this file instead of returning it') } },
  async ({ mode, symbols, path: p }) => { const md = H.toMarkdown(house, { mode, symbols }); if (p) { try { p = safePath(p); } catch (e) { return fail(e.message); } fs.writeFileSync(p, md); return text('Wrote ' + p); } return text(md); });
server.registerTool('house_priorities', { title: 'Priorities', description: 'Characteristics by weighted importance: weight, share, rank (gates are not ranked), and the needs each one drives.', inputSchema: { mode: z.enum(['importance', 'gap']).default('importance') } },
  async ({ mode }) => { const c = C(mode); return text({ mode, characteristics: [...house.characteristics.keys()].sort((a, b) => c.abs[b] - c.abs[a]).map(j => { const h = house.characteristics[j]; return { id: h.id, name: h.name, weight: c.abs[j], share: Math.round(c.pct[j] * 1000) / 10, rank: c.gate[j] ? 'gate' : c.rank[j], gate: c.gate[j], target: h.target, today: h.today, drives: house.needs.filter(w => (house.relationships[w.id] || {})[h.id]).map(w => w.id + ':' + house.relationships[w.id][h.id]) }; }),
    needs: house.needs.map((w, i) => ({ id: w.id, short: w.short, importance: w.importance, today: w.today, goal: w.goal, ratio: Math.round(c.ratio[i] * 100) / 100, gapShare: Math.round(c.adjPct[i] * 1000) / 10 })), pendingProposals: (house.proposals || []).length }); });
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
server.registerTool('house_items', { title: 'Work items, the board against the tests, gates, path, overdue', description: 'The daily read: each item\'s share of the house and its status read against your test verdict (reallyDone, stale = the tracker changed it after the test), the gates and whether they are clear, the critical path with the next open step, where the board and the tests disagree (mismatch), what is overdue (judged against the day the board was read, else the data date, else today), characteristics with no item, and the two progress measures.', inputSchema: {} },
  async () => { const c = C('importance'); const F = H.boardFacts(house, c); const P = F.progress;
    return text({ asOf: F.asOf, asOfSource: F.asOfSource, board: F.board, progress: { rightWall: P.rightWall, statusWeighted: P.statusWeighted, coverage: P.coverage, counts: P.counts, pastDue: P.late, effortLeft: P.effortLeft, effortAll: P.effortAll, asOf: P.asOf }, counts: F.counts,
      gates: F.gates.map(g => ({ id: g.id, short: g.short, state: g.state, today: g.today, target: g.target, items: g.items.map(x => ({ key: x.key, status: x.status, tested: x.tested, retested: x.retested, verdict: x.verdict, due: x.due, late: x.late, stale: x.stale })) })),
      path: { source: F.path.source, firstOpen: F.path.firstOpen, steps: F.path.steps.map(s => ({ label: s.label, text: s.text, keys: s.keys, open: s.open, share: Math.round(s.share * 1000) / 10 })) },
      mismatch: F.mismatch.map(m => ({ key: m.key, kind: m.kind, status: m.status, tested: m.tested, retested: m.retested, stale: m.stale, verdict: m.verdict, title: m.title })),
      overdue: F.overdue.map(o => ({ key: o.key, due: o.due, daysLate: o.daysLate, status: o.status, title: o.title })),
      noItem: F.noItem.map(x => ({ id: x.id, short: x.short, share: Math.round(x.share * 1000) / 10 })),
      items: F.rows.map(r => ({ key: r.key, title: r.title, share: Math.round(r.share * 1000) / 10, serves: r.serves.map(s => s.id + (s.gate ? ' (gate)' : '')), status: r.status, due: r.due, late: r.late, daysLate: r.daysLate, effort: r.effort, tested: r.tested, retested: r.retested, updated: r.updated, stale: r.stale, reallyDone: r.verdict, verdictClass: r.verdictClass, note: r.note })) }); });
server.registerTool('house_draw', { title: 'Draw the house as SVG', description: 'The house as an SVG drawing (roof, room, right wall, basement). reduce hides rows and columns with no relationship.',
  inputSchema: { reduce: z.boolean().default(false), symbols: z.boolean().default(true).describe('true: ● ○ △; false: 9 3 1'), path: z.string().optional().describe('write the SVG to this file instead of returning it') } },
  async ({ reduce, symbols, path: p }) => { const svg = H.toSVG(house, { reduce, symbols }); if (p) { try { p = safePath(p); } catch (e) { return fail(e.message); } fs.writeFileSync(p, svg); return text('Wrote ' + p); } return text(svg); });
server.registerTool('house_export', { title: 'Export', description: 'Write the house as the dated TSV (the version of record), the five CSV files, JSON, Markdown, an SVG drawing, or the Excel workbook (needs python3 and openpyxl).',
  inputSchema: { format: z.enum(['tsv', 'csv', 'json', 'md', 'svg', 'xlsx']), path: z.string().describe('file path, or a folder for csv'), mode: z.enum(['importance', 'gap']).default('importance') } },
  async ({ format, path: p, mode }) => { try { p = safePath(p); } catch (e) { return fail(e.message); } const c = C(mode);
    if (format === 'tsv') { fs.writeFileSync(p, H.BOM + H.toTSV(house, c)); appendLog('export', 'tsv ' + p); return text('Wrote ' + p); }
    if (format === 'json') { fs.writeFileSync(p, JSON.stringify(house, null, 2)); return text('Wrote ' + p); }
    if (format === 'md') { fs.writeFileSync(p, H.toMarkdown(house, { mode })); return text('Wrote ' + p); }
    if (format === 'svg') { fs.writeFileSync(p, H.toSVG(house, { mode })); return text('Wrote ' + p); }
    if (format === 'csv') { fs.mkdirSync(p, { recursive: true }); const files = H.toCSV(house); Object.keys(files).forEach(f => fs.writeFileSync(path.join(p, f), H.BOM + files[f])); return text('Wrote ' + Object.keys(files).join(', ') + ' in ' + p); }
    const tmp = path.join(require('os').tmpdir(), 'hoq-' + process.pid + '-' + Date.now() + '.json'); fs.writeFileSync(tmp, JSON.stringify(house));
    try { const r = spawnSync('python3', [path.join(__dirname, '..', 'tools', 'make_xlsx.py'), tmp, p].concat(mode === 'gap' ? ['--gap'] : []), { encoding: 'utf8', env: process.env });
      if (r.error || r.status !== 0) return fail('make_xlsx.py failed: ' + ((r.error && r.error.message) || r.stderr || r.stdout || 'is openpyxl installed? pip install openpyxl'));
      return text((r.stdout || '').trim() || 'Wrote ' + p); } finally { try { fs.unlinkSync(tmp); } catch (e) { /* already gone */ } } });

// ---------- resources ----------
server.registerResource('house', 'hoq://house', { title: 'The current house as JSON', mimeType: 'application/json' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(house, null, 2) }] }));
server.registerResource('report', 'hoq://report', { title: 'The current house as a text report', mimeType: 'text/plain' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: H.report(house) }] }));
server.registerResource('markdown', 'hoq://report.md', { title: 'The current house as a Markdown report', mimeType: 'text/markdown' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: H.toMarkdown(house) }] }));
server.registerResource('drawing', 'hoq://drawing.svg', { title: 'The current house drawn as SVG', mimeType: 'image/svg+xml' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'image/svg+xml', text: H.toSVG(house) }] }));

// ---------- a prompt for running the session ----------
server.registerPrompt('qfd_session', { title: 'Run a House of Quality session', description: 'Guides an agent through building a house with a person: needs with sources, characteristics with units, the room as proposals the person confirms, the roof, scores, gates, then the reading and the Markdown report.',
  argsSchema: { product: z.string().describe('what the house is for') } },
  ({ product }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `We are building a House of Quality for: ${product}.
Work in this order, one step at a time, and confirm each step with me before the next.
1. Needs: ask who the stakeholders are, then list what each needs in their own words, with the source. Add each with need_set. Keep it under about sixteen.
2. Importance: ask me (or the stakeholder) for 1 to 5 per need. Never set it yourself; pass who gave it as "by".
3. Characteristics: for each need, what can be measured on the design that would show it is met? Unit, direction, a target a stranger could test, and where it stands today. Add with characteristic_set. Mark anything that must pass before shipping as a gate.
4. The room: for each pair, 9 if the characteristic decides whether the need is met, 3 for a clear influence, 1 for some, blank otherwise. Propose them with relationships_set_many, each with a one-line note; I confirm them. Use house_next to see which empty cells matter. Then house_validate and read the empty rows and columns back to me.
5. The roof: pairs that help or fight each other, proposed with roof_set. Every trade-off is a decision for someone; say whose.
6. Today and goal: 1 to 5 per need, with need_set and "by".
7. Reading: house_priorities (the top five and the gates), house_diagonal (the blocks, what crosses them, the build order), and if there are tickets, item_set per ticket (status from the board; tested only from evidence, with retested = the date of that test) or items_import from a tracker export, then house_items for the gates, the next step, where the board and the tests disagree, and what is overdue.
8. house_markdown for the report I can read, house_export tsv with today's date as the version of record, house_export svg for a picture.` } }] }));

const transport = new StdioServerTransport();
server.connect(transport).catch(e => { process.stderr.write(String(e) + '\n'); process.exit(1); });
