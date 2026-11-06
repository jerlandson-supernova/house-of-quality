# House of Quality

An interactive House of Quality (the first QFD matrix) that you can fill from a form, a JSON file or five CSV files, with every formula written down, a diagonalised view that finds the modules and couplings in your design, a work-items view that checks "done" against your own tests, and a spreadsheet generator that writes the same house as an Excel workbook with live formulas.

It was built to run a real product review: sixteen stakeholder needs against twenty measurable characteristics, with gates, tickets and a weekly version of record. This repository is the generic version of that tool, with a small sample house (a commuter travel mug) so you can see every part working before you load your own.

**Open `web/index.html` in a browser. Nothing to install.** The sample loads on first visit; the Input tab loads yours.

## What you get

| Part | Where | What it does |
|---|---|---|
| The page | `web/index.html` | House, Diagonal, Work items, Needs, Characteristics, Roof pairs, Legend, Input. Click any cell, dot or diamond to change it; weights and ranks follow. |
| The formulas | `web/hoq-core.js` | Every number the page and the workbook show, as pure functions. Node and the browser load the same file. |
| The input screen | Input tab | Load the sample, start empty, open or drop a `.json` or the CSV files, paste JSON, edit the lists in place, download JSON, CSV or the dated TSV. |
| The command line | `tools/hoq.js` | Validate a file, print a report, write the TSV, convert between JSON and CSV, compute the diagonal order. |
| The workbook | `tools/make_xlsx.py` | The same house as `.xlsx`: roof, room, right wall, basement with live formulas, the Diagonal sheet, roof pairs, legend, lists. |
| The method | `docs/method.md` | How to run a House of Quality from the first interview to the weekly version of record: what we did, step by step. |
| The formulas, explained | `docs/formulas.md` | Each formula, what it means, and its spreadsheet equivalent. |
| The data formats | `docs/data-format.md` | The JSON shape and the five CSV files. |
| The diagonal view | `docs/diagonalization.md` | Why reorder the room, how the order is found, the sources. |

## Quick start

1. Open `web/index.html`. The sample house appears.
2. Click cells in the House: blank → △ 1 → ○ 3 → ● 9. Click the dots to set importance; type today and goal on the right wall; click a roof diamond. The basement, the charts and the Diagonal tab recompute.
3. Go to **Input**. Either edit the needs and characteristics in the tables, or open your own files: a `house.json`, or any of `needs.csv`, `characteristics.csv`, `matrix.csv`, `roof.csv`, `items.csv` (headers in `docs/data-format.md`; `examples/csv/` has a filled set).
4. **Download JSON** to keep the house; **Download TSV** for the dated version of record you send around; **Download the CSV files** to keep it in a repository.

Everything you type stays in your browser's local storage until you download it. The page never sends anything anywhere.

## The command line

```bash
node tools/hoq.js validate examples/sample-house.json     # errors and warnings
node tools/hoq.js report   examples/sample-house.json     # weights, ranks, gates, diagonal order, items, progress
node tools/hoq.js tsv      examples/sample-house.json     # writes sample-house-YYYY-MM-DD.tsv
node tools/hoq.js csv      examples/sample-house.json out/   # the five CSV files
node tools/hoq.js from-csv out/ house.json                # back to one JSON file
```

Add `--gap` to `report` or `tsv` to weight each need by importance × (goal ÷ today) instead of importance alone.

## The workbook

```bash
pip install openpyxl
python3 tools/make_xlsx.py examples/sample-house.json sample.xlsx
```

The workbook's inputs are the coloured cells (importance, today, goal, the room, the roof, difficulty); weighted importance, shares, ratios and ranks are formulas, so the sheet recalculates when the inputs change. The Diagonal sheet links every cell to the HoQ sheet and recomputes its measures, but its order and blocks are fixed at generation; re-run the script after large edits. The script runs `node tools/hoq.js diag` for the order; without node it skips that sheet.

## The method in one paragraph

Write down what the stakeholders need, each with its source and an importance from 1 to 5. Write down the measurable characteristics the design must hit, each with a unit, a direction and a target. Rate every pair 9, 3, 1 or blank. Mark the characteristics that help or fight each other in the roof. Score where each need stands today against its goal. Read the basement: which characteristics carry the weight, and which are must-pass gates that should never be traded against features. Reorder the room along its diagonal to see the modules and the couplings between them. Link each characteristic to the work items that will deliver it, and read the board's status against your own tests. Send the dated TSV as the version of record. The long version, with the mistakes we made, is `docs/method.md`.

## Repository layout

```
web/            index.html (the page), hoq-core.js (the formulas), sample-house.js (the sample, loaded by the page)
tools/          hoq.js (command line), make_xlsx.py (workbook)
examples/       sample-house.json and the same house as five CSV files
docs/           method, formulas, data format, diagonalization
```

`web/sample-house.js` is generated from `examples/sample-house.json` with `node tools/hoq.js sample-js examples/sample-house.json web/sample-house.js`.

## License

MIT. See `LICENSE`.
