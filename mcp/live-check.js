#!/usr/bin/env node
/* A manual check of the real assist path: spends a few cents on the Anthropic API. Not part of npm test.
 *   ANTHROPIC_API_KEY=… node mcp/live-check.js        (or an `ant auth login` profile)
 * Copies the sample house to a temp folder, starts the server with --assist anthropic, asks for four suggestions,
 * prints the proposals with the model's reasons and the token usage, and checks that the room itself did not change. */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoq-live-')); const file = path.join(dir, 'house.json');
  fs.copyFileSync(path.join(__dirname, '..', 'examples', 'sample-house.json'), file);
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, 'server.js'), '--file', file, '--assist', 'anthropic'], env: Object.assign({}, process.env) });
  const client = new Client({ name: 'hoq-live', version: '0.0.1' }); await client.connect(transport);
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args || {} }); return (r.isError ? 'ERROR: ' : '') + r.content.map(c => c.text).join('\n'); };
  console.log(await call('assist_status', {}));
  const t0 = Date.now();
  console.log(await call('assist_suggest', { limit: 4 }));
  console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  const pend = JSON.parse(await call('proposals_list', {}));
  console.log('pending proposals:\n  ' + (pend.map(p => `${p.id} ${p.what} · by ${p.by} · ${p.note}`).join('\n  ') || 'none'));
  const room = JSON.parse(await call('house_get', { part: 'room' })); console.log('W1 row unchanged:', JSON.stringify(room.W1));
  await client.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
