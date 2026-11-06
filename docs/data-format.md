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
    "notes": [ { "term": "Importance", "text": "How the 1 to 5 scale was agreed." } ]
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
    "MUG-1": { "title": "Thicker vacuum wall", "status": "In Progress", "due": "2026-11-20", "effort": 5, "tested": "partial", "note": "" }
  },
  "statusScale": { "To Do": 0, "In Progress": 0.35, "In Review": 0.6, "Staging": 0.8, "Done": 1 },
  "blockNames": { "H1+H2": "Heat retention" },
  "narrative": { "criticalPath": [["MUG-3", "why first"]], "findings": ["a sentence"] }
}
```

### Fields

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

**items** maps a work-item key to `title`, `status`, `due` (`YYYY-MM-DD`), `effort` (any number; story points, days), `tested` (`verified`, `partial`, `failed`, `not built`, `not retested`) and `note`. The Work items tab reads `status` against `tested` to say whether something is really done.

**statusScale** maps each status to a progress weight from 0 to 1, used by the "status, weighted by the house" tile. A status not listed counts as 0.

**blockNames** (optional) names a diagonal block by the sorted `+`-joined ids of its characteristics. Blocks without a name are labelled by their two heaviest characteristics.

**narrative** (optional): `criticalPath`, a list of `[item, text]` pairs shown in order on the Work items tab; `findings`, sentences shown under the gates.

### Links

A links field is free text. Keys are read from it as follows: a segment such as `KAN-120, 62 to 68; L3CD-83` yields `KAN-120`, `KAN-62`…`KAN-68` and `L3CD-83` (a project prefix, a dash, numbers, ranges with `to`, segments split by `;`). A plain word (`MUG-3` also matches the prefix rule) is kept only when it is a key in `items`, so prose in the field is ignored.

## CSV

Five files, UTF-8, comma-separated, quotes for fields with commas. The Input tab and `from-csv` recognise each file by its header row, so the file names are free.

| File | Header |
|---|---|
| `needs.csv` | `id,need,short,source,importance,today,goal,links,why` |
| `characteristics.csv` | `id,name,short,unit,direction,target,target_short,today,today_short,links,difficulty,gate` |
| `matrix.csv` | `need,H1,H2,…` then one row per need: the need id, then 9, 3, 1 or blank per characteristic |
| `roof.csv` | `a,b,value` |
| `items.csv` | `key,title,status,due,effort,tested,note` |

Any subset can be loaded; the parts you do not load keep what the page already has. Title, notes, status weights and block names live only in the JSON; `from-csv` reads them from a `house.json` in the same folder if there is one.

`examples/csv/` holds the sample as CSV.

## TSV

`Download TSV` on the Input tab, `Copy as TSV` on the House, and `tools/hoq.js tsv` write one tab-separated table: a first row with the title, the export date, the data date, the scoring mode, the row order and the gates; then the house with the room, the right wall, the basement and the roof pairs. It pastes into Excel or Sheets as a sheet. It is the file to send: dated, with its scoring mode on it, so two readers never argue about which version they have.
