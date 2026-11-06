# Using the house from an AI agent

`mcp/server.js` is a Model Context Protocol server. Any MCP client (Claude Code, Claude Desktop, Cursor, an SDK script) can connect to it and build, fill, read and export a House of Quality through tools. The tools call the same `web/hoq-core.js` the page and the command line use, so the numbers agree everywhere.

## Install

```bash
git clone https://github.com/jerlandson-supernova/house-of-quality
cd house-of-quality && npm install
```

Claude Code:

```bash
claude mcp add hoq -- node /absolute/path/to/house-of-quality/mcp/server.js --file ./house.json
```

Other clients take the same command (`node`) and arguments. `--file` names the JSON file the house is loaded from and saved to after every change; without it the house lives in memory until `house_save`. `HOQ_FILE` in the environment does the same as `--file`.

Check it works: `npm test` runs a client against the server, builds a small house, reads the priorities, the diagonal and the items, exports TSV and CSV, and checks the autosave.

## The tools

| Tool | What it does |
|---|---|
| `house_new` | Start an empty house with a title, date, author and what "today" means. |
| `house_open`, `house_save` | Load a JSON file or a folder of the five CSV files; save as JSON. |
| `house_summary`, `house_get`, `house_validate` | Counts; any part of the house as JSON; errors and warnings (empty rows and columns included). |
| `need_set`, `need_remove` | Add or update a need (row): text, source, importance, today, goal, links, why. |
| `characteristic_set`, `characteristic_remove` | Add or update a characteristic (column): name, unit, direction, target, today, links, difficulty, gate. |
| `relationship_set`, `relationships_set_many` | Room cells: 9, 3, 1 or 0 (strong, medium, weak, none). |
| `roof_set` | A pair of characteristics: ++, +, −, −− or empty. |
| `item_set`, `item_remove`, `status_scale_set` | Work items with status, due date, effort and your test verdict; the status weights. |
| `house_report` | The plain-text report: weights, ranks, gates, diagonal order, items, progress. |
| `house_priorities` | Characteristics by weighted importance with share, rank and the needs each one drives; needs with their gap share. |
| `house_diagonal` | Blocks, coupling verdicts (strong only and all levels), what crosses the blocks, ties to cut, empty rows and columns. |
| `house_items` | Each item's share of the house, status read against the test verdict ("really done?"), the two progress measures, past-due items. |
| `house_draw` | The house as SVG, optionally reduced to rows and columns with relationships. |
| `house_export` | TSV (the dated version of record), CSV, JSON, SVG or the Excel workbook. |

Resources: `hoq://house` (JSON), `hoq://report` (text), `hoq://drawing.svg`. Prompt: `qfd_session`, which walks an agent through a session with a person.

## How an agent should run a session

The method is in `method.md`; these are the rules that matter when a program is doing the typing.

1. **Needs come from people, in their words, with a source.** Ask who the stakeholders are, then ask each what they need. Do not invent needs from the product description. Keep the list short enough to argue about.
2. **Importance is theirs, not yours.** Ask for the 1 to 5 and record who gave it and when, in the need's `why`. Never fill it with a default and move on.
3. **A characteristic has a unit.** If you cannot name the unit, you have a wish, not a characteristic. Give it a direction, a target a stranger could test, and today's measured state.
4. **Rate the room out loud.** Propose a value and the reason, let the person correct it. 9 only when the characteristic decides whether the need is met. Most cells stay blank. Use `relationships_set_many` to set a batch after agreement, not one call per cell during the conversation.
5. **Read the empty rows and columns back.** `house_validate` lists needs nothing serves and characteristics that drive nothing. Each one is a finding, not an error to hide.
6. **Gates are not features.** Anything that must pass before shipping (a safety limit, a legal rule) is a gate: it keeps its weight and leaves the rank.
7. **The roof is a list of decisions.** Every − or −− belongs to someone. Say whose.
8. **Read, then export.** `house_priorities` for the top five and the gates, `house_diagonal` for the modules and the build order, `house_items` when there are tickets. Then `house_export` as TSV with today's date: that file is the version of record. The page, the JSON and the SVG are for working and looking; the dated TSV is what people cite.
9. **A board status is a claim.** When you load tickets, add `tested` from evidence you have seen, or leave it empty. `house_items` then says where the board overstates.

## Example, from the SDK

```js
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({ name: 'me', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp/server.js', '--file', 'house.json'] }));
await client.callTool({ name: 'house_new', arguments: { title: 'Kettle', date: '2026-11-05' } });
await client.callTool({ name: 'need_set', arguments: { need: 'Boils a litre in under three minutes', source: 'Survey', importance: 5, today: 2, goal: 5 } });
await client.callTool({ name: 'characteristic_set', arguments: { name: 'Heater power', unit: 'W', direction: '↑', target: '≥ 2400 W', today: '1800 W' } });
await client.callTool({ name: 'relationship_set', arguments: { need: 'W1', characteristic: 'H1', value: 9 } });
const p = await client.callTool({ name: 'house_priorities', arguments: {} });
console.log(p.content[0].text);
```

`mcp/test-client.js` is a longer version of this.
