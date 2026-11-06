# Data format

A house is one JSON file. The same house can be kept as five CSV files, which is easier to edit in a spreadsheet and to diff in a repository. `tools/hoq.js csv` and `from-csv` convert between the two; the Input tab reads both.

Older field names are accepted on load (`src`, `imp`, `now`, `link`, `dir`, `tShort`, `nShort`, `diff`, `hows`, `rel`, `REL0`, `ROOF0`) and written back under the names below.

## JSON

```json
{
  "title": "Commuter travel mug",
  "subtitle": "One line shown under the title.",
  "meta": {
    "date": "2026-11-05",
    "author": "who set the ratings",
    "todayLabel": "current prototype",
    "scale": "1 poor to 5 excellent",
    "notes": [ { "term": "Importance", "text": "How the 1 to 5 scale was agreed." } ],
    "boardRead": "2026-11-06T17:12:00.000Z",
    "boardSource": "Jira CSV export jira-export.csv"
  },
  "needs": [
    { "id": "W1", "need": "Coffee is still hot two hours after filling", "short": "Hot for two hours",
      "source": "Commuter survey", "importance": 5, "today": 3, "goal": 5, "links": "MUG-1, MUG-2", "why": "" }
  ],
  "characteristics": [
    { "id": "H1", "name": "Temperature after two hours at 20 °C", "short": "Temperature after 2 h", "unit": "°C",
      "direction": "↑", "target": "≥ 70 °C from a 90 °C fill", "targetShort": "≥ 70 °C",
      "today": "61 °C on the prototype", "todayShort": "61 °C", "links": "MUG-1", "difficulty": 4, "gate": false }
  ],
  "relationships": { "W1": { "H1": 9, "H2": 9, "H10": 1 } },
  "roof": { "H1|H2": "++", "H2|H9": "−" },
  "items": {
    "MUG-1": { "title": "Thicker vacuum wall", "status": "In Progress", "due": "2026-11-20", "effort": 5,
               "tested": "partial", "retested": "2026-11-03", "updated": "2026-11-05T16:40:00.000Z", "resolved": "", "priority": "High", "sprint": "Sprint 4", "note": "" }
  },
  "statusScale": { "To Do": 0, "In Progress": 0.35, "In Review": 0.6, "Staging": 0.8, "Done": 1 },
  "blockNames": { "H1+H2": "Heat retention" },
  "narrative": { "criticalPath": [["MUG-3", "why first"]], "findings": ["a sentence"] }
}
```

### Fields

**meta**

| Field | Meaning |
|---|---|
| `date` | The date the data is as of, `YYYY-MM-DD`. Shown in the header; past-due items are judged against it when no `boardRead` is recorded. |
| `boardRead` | When the work-item statuses were last read from the tracker (an ISO instant). Set by every tracker import (the page, `hoq.js import-items`, `jira-pull.js`, `items_import`). Its local date is the day "past due" is judged against. |
| `boardSource` | Where those statuses came from, in words: `Jira CSV export jira-export.csv`, `Jira your-site.atlassian.net`. Shown on the Daily strip. |
| `author` | Who set the ratings. The page records this name as the provenance of every edit made in it. |
| `todayLabel` | What every "today" in the house describes: the build, prototype or week the today scores and the measured states refer to, e.g. `current prototype` or `staging build of 5 Nov`. It replaces the word "today" in the page's and the workbook's headers. `date` is when; this is what. |
| `scale` | A reminder of the 1 to 5 scale, shown in the legend. |
| `notes` | A list of `{ term, text }` shown on the Legend tab and in the workbook. |

**needs** (the rows, WHATs)

| Field | Meaning |
|---|---|
| `id` | Short unique key, `W1`, `W2`… Used in `relationships`. |
| `need` | The need in the stakeholder's words. |
| `short` | A short label for the diagonal view and the charts (default: the need, cut). |
| `source` | Who said it: a survey, a person, a regulation, returns data. |
| `importance` | 1 to 5. |
| `today`, `goal` | 1 (poor) to 5 (excellent): where this need stands now and where it should be. `meta.todayLabel` says what "today" means. |
| `links` | Work-item keys this need is delivered by (see links below). |
| `why` | Free text: why it matters, where it stands. |

**characteristics** (the columns, HOWs)

| Field | Meaning |
|---|---|
| `id` | Short unique key, `H1`, `H2`… |
| `name` | The measurable characteristic. |
| `short` | Short label for the column header. |
| `unit` | Its unit. |
| `direction` | `↑` larger is better, `↓` smaller is better, `◎` meet the target. Words such as `up`, `down`, `target` are mapped on load. |
| `target`, `targetShort` | The target value and a short form for the basement. |
| `today`, `todayShort` | Where it stands now and a short form. |
| `links` | Work-item keys that will deliver it. The characteristic's weighted importance is split evenly over them. |
| `difficulty` | 1 to 5, informational. |
| `gate` | `true` for a must-pass gate: kept out of the rank, never traded against features. |

**relationships** maps a need id to a map of characteristic id → 9, 3 or 1. Blank cells are left out. `●`, `○`, `△` are accepted on load.

**roof** maps `"A|B"` to `++`, `+`, `−` or `−−`. Keys are made canonical on load (the characteristic listed first comes first). `--` is accepted for `−−`.

**items** maps a work-item key to the fields below. Two kinds of fact live side by side: what the tracker says (`status`, `due`, `effort`, `updated`, `resolved`, `priority`, `sprint`, and usually `title`) and what the owner's own test said (`tested`, `retested`, `note`). A tracker import refreshes the first kind and never touches the second.

| Field | Meaning |
|---|---|
| `title` | The item's title (the tracker's summary). |
| `status` | The tracker's status, as written there. `statusScale` gives it a progress weight; a status not in the scale counts as 0 and is listed as unknown. |
| `due` | `YYYY-MM-DD`. Jira's export form (`10/Nov/26 9:00 AM`) is accepted and converted. |
| `effort` | Any number: story points, days. Jira's "Story point estimate" lands here. |
| `tested` | The owner's verdict, one scale everywhere: `verified` (the test passed), `partial` (passed with open clauses), `fails` (the test fails), `not built` (nothing to test yet), or empty (no test yet). `failed` is read as `fails`. The old `not retested` is no longer a verdict: it is dropped with a warning, and the date goes in `retested` instead. |
| `retested` | `YYYY-MM-DD`: the date of the test the verdict comes from. |
| `updated` | When the tracker last changed the item (an ISO instant; Jira's forms are converted). When its date is after `retested`, the item is **changed since the test** and shows as stale. |
| `resolved`, `priority`, `sprint` | From the tracker, informational. `sprint` is the name of the last sprint listed. |
| `note` | The owner's note: the evidence behind the verdict, short and dated. |

Daily reads `status` against `tested` to say whether something is really done (`docs/formulas.md`, "Really done?").

**statusScale** maps each status to a progress weight from 0 to 1, used by the "status, weighted by the house" tile. A status not listed counts as 0.

**blockNames** (optional) names a diagonal block by the sorted `+`-joined ids of its characteristics. Blocks without a name are labelled by their two heaviest characteristics.

**narrative** (optional): `criticalPath`, a list of `[label, text]` pairs shown in order on Daily as "What to do next" (the keys in each label, such as `"MUG-1 with MUG-2"`, decide whether the step is open or done); `findings`, sentences for the report.

**revision** counts accepted changes (the page and the MCP server both increment it), so two copies can be told apart.

**provenance** records who set a value, keyed by what it is: `cell:W1|H2`, `roof:H1|H2` (canonical order), `importance:W1`, `today:W1`, `goal:W1`. Each entry is `{ value, by, confirmedBy, when, note, evidence }`. The page writes the author's name on every edit; the MCP server writes the agent's name, or the stakeholder named in `by`.

**proposals** are values an agent suggested that no one has confirmed yet: `{ id, kind, need, characteristic, a, b, value, by, when, note, evidence }` with `kind` one of `cell`, `roof`, `importance`, `today`, `goal`, `need`, `characteristic`. A `need` or `characteristic` proposal carries `fields` (the row or column to add, in the same shape as the lists above; the id is assigned on confirmation when absent, and the text may be given as `value` instead). A need confirmed without `importance`, `today` or `goal` gets the defaults (3, 1, 5) and the confirmation warns that nobody gave them. They count in no number. Confirming one (on the page or with `proposal_confirm`) applies it and moves it into `provenance`; rejecting removes it. `proposalSeq` is the counter behind the ids.

The MCP server's change log is not in the JSON: it is an append-only `house.log.jsonl` next to the file, one line per accepted change (`ts`, `actor`, `op`, `summary`, `revision`).

### Links

A links field is free text. Keys are read from it as follows: a segment such as `KAN-120, 62 to 68; L3CD-83` yields `KAN-120`, `KAN-62`…`KAN-68` and `L3CD-83` (a project prefix, a dash, numbers, ranges with `to`, segments split by `;`). A plain word (`MUG-3` also matches the prefix rule) is kept only when it is a key in `items`, so prose in the field is ignored.

## CSV

Five files, UTF-8 with a byte-order mark (so Excel opens them as UTF-8; the readers strip it), comma-separated, quotes for fields with commas. The Input tab and `from-csv` recognise each file by its header row, so the file names are free.

| File | Header |
|---|---|
| `needs.csv` | `id,need,short,source,importance,today,goal,links,why` |
| `characteristics.csv` | `id,name,short,unit,direction,target,target_short,today,today_short,links,difficulty,gate` |
| `matrix.csv` | `need,H1,H2,…` then one row per need: the need id, then 9, 3, 1 or blank per characteristic |
| `roof.csv` | `a,b,value` |
| `items.csv` | `key,title,status,due,effort,tested,retested,updated,note` (the older seven-column file still loads) |

Any subset can be loaded; the parts you do not load keep what the page already has. Title, notes, status weights and block names live only in the JSON; `from-csv` reads them from a `house.json` in the same folder if there is one.

`examples/csv/` holds the sample as CSV.

### Tracker exports

A CSV whose header has an **Issue key** column is read as a tracker export, not as `items.csv`: it is *merged* into the items instead of replacing them. Statuses, due dates, points and the tracker's own timestamps are taken from the export; `tested`, `retested` and `note` are kept as they are, because the tracker knows nothing about your tests. The Input tab, the Daily strip, `hoq.js import-items`, the MCP tool `items_import` and `tools/jira-pull.js` all go through the same `HOQ.importItems`, with one column mapping keyed on the names Jira's CSV export uses (lower-cased, spaces as underscores):

| House field | Export column (`jira` mapping) | Notes |
|---|---|---|
| key | `Issue key` | the row is skipped without it |
| `title` | `Summary` | |
| `status` | `Status` | as written in the tracker |
| `due` | `Due date` | `10/Nov/26 9:00 AM` → `2026-11-10` |
| `effort` | `Custom field (Story point estimate)`, else `Custom field (Story points)`, else `Story points` | the first non-empty one |
| `updated` | `Updated` | the export's local time, stored as an ISO instant |
| `resolved` | `Resolved` | |
| `priority` | `Priority` | |
| `sprint` | `Sprint` | Jira repeats the column for every sprint; the last non-empty one is kept |

A field is written only when its column exists in the export; a column that exists but is empty clears the field (the tracker is the record for those fields). The `items` mapping reads the house's own column names (`key, title, status, due, effort, updated`) the same way, for a file you keep by hand. The MCP tool also takes a mapping of your own, `{field: column}`.

Which keys become new items is the `add` rule: `linked` (the default) adds a key only when a `links` field of a need or a characteristic names it, so an export of a whole project adds nothing the house does not know; `all` adds every row; `none` adds nothing. Every import sets `meta.boardRead` to the time the export was read (the file's modification time on the page and the CLI, the request time in `jira-pull.js`) and `meta.boardSource` to where it came from. `examples/csv/tracker-export.csv` is a Jira-shaped export of the sample, with one key the house does not link.

## TSV

`Download TSV` on the Input tab, `Copy as TSV` on the House, and `tools/hoq.js tsv` write one tab-separated table: a first row with the title, the export date, the data date, the scoring mode, the row order and the gates; then the house with the room, the right wall, the basement and the roof pairs. The file starts with a UTF-8 byte-order mark, so Excel on Windows reads the arrows and symbols instead of guessing the local codepage; pasting from the clipboard needs none. It is the file to send: dated, with its scoring mode on it, so two readers never argue about which version they have.
