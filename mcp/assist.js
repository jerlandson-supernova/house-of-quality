/* assist.js — optional, model-backed suggestions for a House of Quality. Off unless the server runs with --assist.
 *
 * Everything here only PROPOSES: a suggested cell or member becomes a proposal that counts in no number until a person
 * confirms it. The model never writes a weight, a rank or a cell directly.
 *
 * Providers: 'anthropic' (the Anthropic SDK; credentials from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login`
 * profile; model HOQ_ASSIST_MODEL, default claude-opus-5-5) and 'mock' (deterministic, for tests and dry runs).
 * Calls are bounded: at most maxCells cells per call, a request timeout (timeoutMs, default 50 s) with maxRetries (default 1) and a
 * max_tokens ceiling; every result reports usage. Keep attempts × timeout under the MCP client's request timeout (60 s by default).
 */
'use strict';
const path = require('path');
const { z } = require('zod');
const H = require(path.join(__dirname, '..', 'web', 'hoq-core.js'));

const DEFAULT_MODEL = 'claude-opus-5-5';
const CellsSchema = z.object({ cells: z.array(z.object({ need: z.string(), characteristic: z.string(), value: z.number().describe('9, 3, 1 or 0'), reason: z.string().describe('one line: why this value') })) });
const MembersSchema = z.object({ items: z.array(z.object({ text: z.string().describe('the need, or the characteristic, in one line'), short: z.string().describe('two to four words'), excerpt: z.string().describe('the verbatim words of the source this comes from'), unit: z.string().describe('for a characteristic: its unit, else empty'), direction: z.string().describe('for a characteristic: up, down or target, else empty') })) });

const describeHouse = house => [
  `House: ${house.title}.`,
  'Needs (rows; importance 1 to 5):', ...house.needs.map(w => `  ${w.id} [imp ${w.importance}] ${w.need}${w.source ? ' (source: ' + w.source + ')' : ''}`),
  'Characteristics (columns):', ...house.characteristics.map(h => `  ${h.id} ${h.name}${h.unit ? ' [' + h.unit + ']' : ''}${h.target ? ' target: ' + h.target : ''}${h.gate ? ' (must-pass gate)' : ''}`),
  'Cells already set (need × characteristic = value):', ...house.needs.flatMap(w => Object.keys(house.relationships[w.id] || {}).map(hid => `  ${w.id} × ${hid} = ${house.relationships[w.id][hid]}`)),
].join('\n');

const CELL_RULES = `You rate House of Quality (QFD) relationship cells. For a need and a characteristic, answer how much of the need is met if the characteristic hits its target: 9 when the characteristic decides whether the need is met (the primary mechanism), 3 for a clear influence, 1 for some influence, 0 for none. Most cells in a good house are 0: do not invent links. Give a one-line reason that names the mechanism. These are suggestions for a person to confirm; be calibrated, not generous.`;
const MEMBER_RULES = { needs: 'Extract stakeholder needs from the text: each in the stakeholder\'s own words, one line, with the verbatim excerpt it comes from. Only what the text says; nothing from general knowledge.', characteristics: 'Extract measurable characteristics from the text: each with a unit (no unit means it is not a characteristic; leave it out), a direction (up = larger is better, down = smaller is better, target = meet a value), one line, with the verbatim excerpt it comes from. Only what the text says.' };

function mockProvider() {
  const words = s => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 3));
  return {
    name: 'mock', model: 'mock',
    async suggestCells(house, cells) {
      const byW = {}, byH = {}; house.needs.forEach(w => { byW[w.id] = w; }); house.characteristics.forEach(h => { byH[h.id] = h; });
      const out = cells.map(c => { const a = words(byW[c.need].need + ' ' + byW[c.need].short), b = words(byH[c.characteristic].name + ' ' + byH[c.characteristic].short); const shared = [...a].filter(x => b.has(x)); const v = shared.length >= 2 ? 9 : shared.length === 1 ? 3 : 0; return { need: c.need, characteristic: c.characteristic, value: v, reason: shared.length ? 'shares the words ' + shared.join(', ') + ' (mock)' : 'no shared mechanism found (mock)' }; });
      return { cells: out, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    async suggestMembers(house, kind, text) {
      const sentences = String(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 12).slice(0, 6);
      const items = sentences.map(s => ({ text: s.replace(/[.!?]$/, ''), short: s.split(/\s+/).slice(0, 3).join(' '), excerpt: s, unit: kind === 'characteristics' ? 'unit' : '', direction: kind === 'characteristics' ? 'up' : '' }));
      return { items, usage: { input_tokens: 0, output_tokens: 0 } };
    },
  };
}

function anthropicProvider(opts) {
  const Anthropic = require('@anthropic-ai/sdk');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const client = new Anthropic({ timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  const model = opts.model || DEFAULT_MODEL;
  const usageOf = r => r && r.usage ? { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } : {};
  async function parse(system, user, schema) {
    try {
      const r = await client.messages.parse({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }], output_config: { format: zodOutputFormat(schema) } });
      if (r.stop_reason === 'refusal') throw new Error('The model declined this request' + (r.stop_details && r.stop_details.category ? ' (' + r.stop_details.category + ')' : '') + '.');
      if (!r.parsed_output) throw new Error('The model answer did not fit the expected shape' + (r.stop_reason === 'max_tokens' ? ' (cut off at max_tokens)' : '') + '.');
      return { out: r.parsed_output, usage: usageOf(r) };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('No usable Anthropic credentials: set ANTHROPIC_API_KEY or run `ant auth login`.');
      if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited by the Anthropic API; try again in a moment.');
      if (e instanceof Anthropic.BadRequestError) throw new Error('The Anthropic API rejected the request: ' + e.message);
      if (e instanceof Anthropic.APIError) throw new Error('Anthropic API error ' + e.status + ': ' + e.message);
      throw e;
    }
  }
  return {
    name: 'anthropic', model,
    async suggestCells(house, cells) {
      const user = describeHouse(house) + '\n\nRate these cells:\n' + cells.map(c => `  ${c.need} × ${c.characteristic}`).join('\n') + '\n\nReturn one entry per cell, with the ids exactly as given.';
      const { out, usage } = await parse(CELL_RULES, user, CellsSchema);
      return { cells: out.cells, usage };
    },
    async suggestMembers(house, kind, text) {
      const user = describeHouse(house) + `\n\nSource text:\n"""\n${text}\n"""\n\nReturn the ${kind} the text supports, at most 12, none that duplicate what the house already has.`;
      const { out, usage } = await parse(MEMBER_RULES[kind], user, MembersSchema);
      return { items: out.items, usage };
    },
  };
}

/** Make an assist. opts: {provider: 'anthropic'|'mock', model, timeoutMs, maxCells}. */
function createAssist(opts) {
  opts = opts || {};
  const name = opts.provider || 'anthropic';
  if (name !== 'anthropic' && name !== 'mock') throw new Error('assist provider must be anthropic or mock, not "' + name + '"');
  const timeoutMs = opts.timeoutMs > 0 ? opts.timeoutMs : 50000, maxRetries = opts.maxRetries >= 0 ? opts.maxRetries : 1;
  const provider = name === 'mock' ? mockProvider() : anthropicProvider(Object.assign({}, opts, { timeoutMs, maxRetries }));
  const maxCells = opts.maxCells || 12;
  const relValue = v => { const n = Math.round(Number(v)); return [0, 1, 3, 9].includes(n) ? n : null; };
  return {
    provider: provider.name, model: provider.model, maxCells, timeoutMs, maxRetries,
    /** Suggest values for empty cells (the house_next cells by default) and record them as proposals. */
    async suggest(house, cells, actor) {
      const wanted = (cells && cells.length ? cells : H.nextCells(house, maxCells).cells.map(c => ({ need: c.need, characteristic: c.characteristic }))).slice(0, maxCells);
      const valid = wanted.filter(c => house.needs.some(w => w.id === c.need) && house.characteristics.some(h => h.id === c.characteristic) && !(house.relationships[c.need] || {})[c.characteristic]);
      const skipped = wanted.length - valid.length;
      if (!valid.length) return { proposed: [], blank: [], dropped: 0, skipped, usage: {} };
      const r = await provider.suggestCells(house, valid);
      const proposed = [], dropped = [];
      r.cells.forEach(s => { const v = relValue(s.value); const known = valid.some(c => c.need === s.need && c.characteristic === s.characteristic); if (v === null || !known) { dropped.push(s); return; }
        if (v === 0) { dropped.push(Object.assign({ why: 'suggested blank' }, s)); return; }
        const p = H.propose(house, { kind: 'cell', need: s.need, characteristic: s.characteristic, value: v, by: actor, note: String(s.reason || '').slice(0, 300), evidence: 'model suggestion (' + provider.model + ')' }); if (!p.error) proposed.push(p.proposal); });
      return { proposed, blank: dropped.filter(d => d.why).map(d => d.need + ' × ' + d.characteristic), dropped: dropped.filter(d => !d.why).length, skipped, usage: r.usage };
    },
    /** Propose new needs or characteristics from supplied text (interview notes, a survey, a review), each with its excerpt. */
    async members(house, kind, text, actor) {
      if (!['needs', 'characteristics'].includes(kind)) throw new Error('kind must be needs or characteristics');
      const r = await provider.suggestMembers(house, kind, String(text).slice(0, 20000));
      const proposed = [];
      r.items.slice(0, 12).forEach(it => { if (!it.text) return;
        const fields = kind === 'needs' ? { need: it.text, short: it.short || it.text.slice(0, 40), source: 'assist from supplied text' } : { name: it.text, short: it.short || it.text.slice(0, 36), unit: it.unit || '', direction: it.direction || '' };
        if (kind === 'characteristics' && !fields.unit) return;
        const p = H.propose(house, { kind: kind === 'needs' ? 'need' : 'characteristic', fields, by: actor, note: 'from the supplied text', evidence: String(it.excerpt || '').slice(0, 300) }); if (!p.error) proposed.push(p.proposal); });
      return { proposed, usage: r.usage };
    },
  };
}

module.exports = { createAssist, DEFAULT_MODEL };
