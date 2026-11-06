# Using the house from an AI agent

`mcp/server.js` is a Model Context Protocol server. Any MCP client (Claude Code, Claude Desktop, Cursor, an SDK script) connects to it and builds, fills, reads and exports a House of Quality through tools. The tools call the same `web/hoq-core.js` the page and the command line use, so the numbers agree everywhere.

## Install

```bash
git clone https://github.com/jerlandson-supernova/house-of-quality
cd house-of-quality && npm install
claude mcp add hoq -- node "$PWD/mcp/server.js" --file ./house.json
node tools/hoq.js skills install --target all --project .      # the skill for Claude Code, Codex, Cursor, Copilot, Gemini and AGENTS.md readers; --user installs the Claude, Codex and Gemini ones for every project
```

Other clients take the same command (`node`) and arguments. Options:

| Option | Effect |
|---|---|
| `--file F` | load the house from `F` and save it there after every change; the change log goes to `F.log.jsonl` |
| `--actor NAME` | who the agent is in provenance and proposals (default `agent`) |
| `--direct` | let the agent write room cells and roof pairs directly, with provenance, for imports and scripts. Without it they become proposals |
| `--no-confirm` | remove `proposal_confirm`, so only a person on the page can confirm. `proposal_confirm` refuses the agent's own name but cannot check that the person really said yes; use this flag when that matters |
| `--anywhere` | let the agent read and write files outside the house's folder. By default `house_open`, `house_save`, `house_export`, `house_draw` and `house_markdown` refuse a path outside the folder of `--file` (or the working directory) |
| `--assist [provider]` | add the assist tools below. `provider` is `anthropic` (default; credentials from `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile; model `HOQ_ASSIST_MODEL`, default `claude-opus-5-5`) or `mock` (deterministic, no key); any other name is refused at startup. `HOQ_ASSIST_MAX_CELLS` bounds one call (default 12); `HOQ_ASSIST_TIMEOUT_MS` (default 50000) and `HOQ_ASSIST_RETRIES` (default 1) bound one request. Keep attempts × timeout under the MCP client's request timeout (60 s by default), or the client gives up while the server still records the proposals |

`npm test` runs the core checks, the skills installer checks and a client against the server in proposal mode, direct mode and assist (mock) mode.

## The assist: a model suggests, a person confirms

With `--assist` the server gains `assist_status`, `assist_suggest` and `assist_members`. `assist_suggest` takes the empty cells from `house_next` (or the cells you name) and asks the model for 9, 3, 1 or 0 with a one-line reason; `assist_members` takes a text (interview notes, a survey, a review, a spec) and asks for the needs or the characteristics it supports, each with the verbatim excerpt it comes from, and only characteristics that have a unit. Everything comes back as proposals by the actor `assist:<model>`: a suggested blank is reported, not recorded; a suggested value waits for a person like any other proposal. The model never writes a cell, a weight or a rank. Calls are bounded (cells per call, request timeout, output ceiling) and report token usage. A refusal or a malformed answer is an error, not a silent blank.

Use it the way you would use a junior colleague's first pass: ask for suggestions on the structural gaps, read the reasons out to the person, and let them confirm. Do not run it over every empty cell; most cells of a good house stay blank.

`node mcp/live-check.js` runs one real call against the API (four cells of the sample house, about 2,200 tokens, a couple of cents at Opus 5.5 rates) and prints the proposals, the reasons, the usage and a check that the room did not change. It is not part of `npm test`, which uses the mock provider.

## Installing the skill for other clients

`node tools/hoq.js skills install --target all --project .` writes the skill for Claude Code (`.claude/skills/hoq/SKILL.md`), Codex (`.agents/skills/hoq/SKILL.md`), Cursor (`.cursor/rules/hoq.mdc`), Copilot (`.github/instructions/hoq.instructions.md`), Gemini (a marked section in `GEMINI.md`) and any `AGENTS.md` reader (a marked section). `--user` installs the Claude, Codex and Gemini ones under your home directory for every project; the others are per project. `.hoq-skills.json` records what was written with hashes: a file you edited is never overwritten without `--force`, `uninstall` removes only what still matches, and `--dry-run` shows the plan.

## Proposals: the agent suggests, a person confirms

By default, a room cell or roof pair the agent sets does not change the house. It becomes a **proposal**, with the agent's note and evidence, and counts in no weight, rank or share until a person confirms it. The person confirms on the page (Input tab, Proposals; the cell shows a `?` in the House until then) or, when they have said so in the conversation, the agent calls `proposal_confirm` with the person's name. The server refuses a confirmation signed by the agent itself.

Confirmed values carry **provenance**: who proposed, who confirmed, when, the note and the evidence. Values a person sets on the page carry the page author's name. Importance, today and goal set through `need_set` carry `by`, the stakeholder who gave the number. A proposed need confirmed without them gets the defaults (3, 1, 5) and the confirmation says so: go back to the stakeholder and set them with `need_set`. `house_get provenance` returns all of it; the Markdown report lists it.

Every accepted change appends one line to the **change log**: time, actor, operation, summary, revision. `house_log` reads it; with `--file` it is also on disk as `house.log.jsonl`, append-only. The house's `revision` counts accepted changes, so two parties can tell whether they hold the same version.

## The tools

| Tool | What it does |
|---|---|
| `house_new` | Start an empty house with a title, date, author and what "today" means. |
| `house_open`, `house_save` | Load a JSON file or a folder of the five CSV files; save as JSON. |
| `house_summary`, `house_get`, `house_validate`, `house_log` | Counts; any part of the house as JSON (including `provenance` and `proposals`); errors and warnings (empty rows and columns included); the change log. |
| `need_set`, `need_remove` | Add or update a need (row): text, source, importance, today, goal, links, why, with `by` for the numbers. |
| `characteristic_set`, `characteristic_remove` | Add or update a characteristic (column): name, unit, direction, target, today, links, difficulty, gate. |
| `relationship_set`, `relationships_set_many` | Room cells: 9, 3, 1 or 0, with a note and evidence. Proposals unless `--direct`. |
| `roof_set` | A pair of characteristics: ++, +, −, −− or empty. A proposal unless `--direct`. |
| `propose`, `proposals_list`, `proposal_confirm`, `proposal_reject` | Suggest any value (a cell, a roof pair, a need's importance, today or goal, or a whole new need or characteristic with its fields); list, confirm as a named person, reject with a reason. |
| `assist_status`, `assist_suggest`, `assist_members` | With `--assist` only: a model's suggestions for cells, needs or characteristics, as proposals. |
| `house_next` | The empty cells worth looking at: needs nothing serves, needs with no strong driver, characteristics driving nothing, then by weight. Most cells of a good house stay blank; this names the structural gaps. |
| `item_set`, `item_remove`, `status_scale_set` | Work items: status, due date and effort from the tracker; `tested` (verified, partial, fails, not built; `failed` is read as fails, `not retested` is dropped with a warning) with `retested`, the date of that test; `updated` from the tracker; the status weights. |
| `items_import` | Refresh the items from a tracker export: `rows` (records keyed by the export's column names) or `csv` (a Jira CSV's text), `mapping` `jira` (default), `items` or your own `{field: column}`, `add` `linked` (default: only keys a links field names), `all` or `none`, `source`, `readAt`, `dryRun`. Statuses, due dates, points, updated, resolved, priority and sprint are merged; `tested`, `retested` and `note` are never touched. Written directly (statuses are the tracker's facts, not a judgement) and logged as `items.import` with the changes. |
| `house_report`, `house_markdown` | The plain-text report; the full Markdown report (summary, needs, characteristics, the room, the roof, the diagonal blocks and coupling, items, pending proposals, findings, provenance). |
| `house_priorities` | Characteristics by weighted importance with share, rank and the needs each one drives; needs with their gap share. |
| `house_diagonal` | Blocks, coupling verdicts (strong only and all levels), what crosses the blocks, ties to cut, empty rows and columns. |
| `house_items` | The daily read: `asOf` and `asOfSource` (the day lateness is judged against: board read, data date or today), `board` (source and read time), `gates` with a `clear` / `blocked` / `no item` state, `path` (the critical path with `firstOpen`), `mismatch` (where the board and the tests disagree: overstated, not yet, open clauses, partly, understated, stale), `overdue` with days late, `noItem`, `counts`, and every item with its share, status, `tested`, `retested`, `updated`, `stale` (changed since the test), `reallyDone` and `verdictClass`. |
| `house_draw` | The house as SVG, optionally reduced to rows and columns with relationships. |
| `house_export` | TSV (the dated version of record), CSV, JSON, Markdown, SVG or the Excel workbook. |

Resources: `hoq://house` (JSON), `hoq://report` (text), `hoq://report.md` (Markdown), `hoq://drawing.svg`. Prompt: `qfd_session`, which walks an agent through a session with a person.

## How an agent should run a session

The method is in `method.md`; these are the rules that matter when a program is doing the typing. The same text ships as a skill in `skills/hoq/SKILL.md`.

1. **Needs come from people, in their words, with a source.** Ask who the stakeholders are, then ask each what they need. Do not invent needs from the product description. Keep the list short enough to argue about.
2. **Importance is theirs, not yours.** Ask for the 1 to 5 and pass who gave it as `by`. Never fill it with a default and move on.
3. **A characteristic has a unit.** If you cannot name the unit, you have a wish, not a characteristic. Give it a direction, a target a stranger could test, and today's measured state.
4. **Rate the room out loud, then propose.** Say the reasoning for a cell, put it in `note`, and propose a batch with `relationships_set_many`. 9 only when the characteristic decides whether the need is met. Most cells stay blank. `house_next` tells you where the structural gaps are.
5. **Read the empty rows and columns back.** `house_validate` lists needs nothing serves and characteristics that drive nothing. Each one is a finding, not an error to hide.
6. **Gates are not features.** Anything that must pass before shipping (a safety limit, a legal rule) is a gate: it keeps its weight and leaves the rank.
7. **The roof is a list of decisions.** Every − or −− belongs to someone. Say whose.
8. **Read, then hand over.** `house_priorities` for the top five and the gates, `house_diagonal` for the modules and the build order, `house_items` when there are tickets. `house_markdown` is the report for the person. `house_export` as TSV with today's date is the version of record; the page, the JSON and the SVG are for working and looking.
9. **A board status is a claim.** Load statuses from the tracker (`items_import` from an export, or `item_set` per ticket) and add `tested` only from evidence you have seen, with `retested` as the date of that test; otherwise leave it empty. `house_items` then says where the board overstates, which items changed on the board after their test, which gates are clear and what is overdue. Never set a verdict to make the board look right.

## Example, from the SDK

```js
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({ name: 'me', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp/server.js', '--file', 'house.json'] }));
await client.callTool({ name: 'house_new', arguments: { title: 'Kettle', date: '2026-11-05' } });
await client.callTool({ name: 'need_set', arguments: { need: 'Boils a litre in under three minutes', source: 'Survey', importance: 5, today: 2, goal: 5, by: 'Survey, 40 commuters' } });
await client.callTool({ name: 'characteristic_set', arguments: { name: 'Heater power', unit: 'W', direction: '↑', target: '≥ 2400 W', today: '1800 W' } });
await client.callTool({ name: 'relationship_set', arguments: { need: 'W1', characteristic: 'H1', value: 9, note: 'power is the mechanism' } });   // a proposal
await client.callTool({ name: 'proposal_confirm', arguments: { id: 'p1', confirmedBy: 'John' } });                                            // after John said yes
const p = await client.callTool({ name: 'house_priorities', arguments: {} });
console.log(p.content[0].text);
```

`mcp/test-client.js` is a longer version of this.
