---
name: hoq
description: Build and read a House of Quality (QFD) through the hoq MCP server, with a person. Use when asked to run a QFD, a House of Quality, a needs-to-characteristics matrix, to prioritise characteristics against stakeholder needs, or to check what a product build must hit. Needs come from stakeholders in their words with a source, importance is theirs to give, every characteristic has a unit, room cells and roof pairs are proposals the person confirms, gates are never ranked, and the dated TSV is the version of record.
---

# House of Quality with the hoq MCP server

The server (`node mcp/server.js --file house.json`, from github.com/jerlandson-supernova/house-of-quality) holds one house and saves it after every change. The person can open the same file in the web page and keep editing; proposals you make wait there for their confirmation.

## The session, in order

1. **Who are the stakeholders?** Ask. Then, for each, what they need, in their own words. `need_set` with `need`, `source`, `short`. Keep it under about sixteen needs. Do not invent needs from a product description.
2. **Importance** is 1 to 5 and belongs to the stakeholder. Ask, then `need_set` with `importance` and `by` (who gave it). Never guess it.
3. **Characteristics**: for each need, what can be measured on the design that would show it is met? `characteristic_set` with a `unit`, a `direction` (↑ ↓ ◎), a `target` a stranger could test, and `today` as measured. No unit means it is a wish, not a characteristic. Anything that must pass before shipping (safety, legal) gets `gate: true`.
4. **The room**: for each pair, 9 if the characteristic decides whether the need is met, 3 for a clear influence, 1 for some, blank otherwise. Most cells stay blank. Propose with `relationships_set_many`, each cell with a one-line `note` and, where you have it, `evidence`. They count in no number until the person confirms them (`proposal_confirm` with their name, only when they have said so, or on the page). `house_next` ranks the empty cells worth a look: needs nothing serves, needs with no strong driver, characteristics driving nothing.
5. **The roof**: pairs of characteristics that help (++, +) or fight (−, −−). `roof_set` proposes. Every trade-off is a decision for someone; say whose.
6. **Today and goal** per need, 1 to 5, through `need_set` with `by`.
7. **Read it**: `house_validate` (read the empty rows and columns back to the person), `house_priorities` (the top five, the gates), `house_diagonal` (the blocks are the modules; the coupling verdict says whether a build order exists; the ties to cut say what to redesign), and with tickets `item_set` per ticket then `house_items` (each item's share of the house, and the status read against the test verdict).
8. **Hand it over**: `house_markdown` is the report for a person; `house_export` as `tsv` with today's date is the version of record; `house_export` as `svg` is a picture; `xlsx` is the workbook with live formulas.

## Rules

- A need you made up is worse than a missing need. A number you guessed is worse than a blank.
- Say the reasoning for a cell before proposing it; put it in `note`.
- Importance, today and goal: always with `by`. The provenance is the audit trail.
- A gate keeps its weight but is never ranked against a feature.
- A board status is a claim. Add `tested` to an item only from evidence you have seen.
- The page is for working; the dated TSV is what people cite. Page edits reach no one.

## If the server runs with --assist

`assist_suggest` asks a model for cell values on the structural gaps, `assist_members` extracts needs or characteristics from a text the person gives you. Both return proposals only, by the actor `assist:<model>`. Read the model's reasons out to the person before they confirm; never confirm a model's suggestion yourself.

## Tools at a glance

`house_new` · `house_open` · `house_save` · `house_summary` · `house_get` · `house_validate` · `house_log` · `need_set` · `need_remove` · `characteristic_set` · `characteristic_remove` · `relationship_set` · `relationships_set_many` · `roof_set` · `propose` · `proposals_list` · `proposal_confirm` · `proposal_reject` · `house_next` · `item_set` · `item_remove` · `status_scale_set` · `house_report` · `house_markdown` · `house_priorities` · `house_diagonal` · `house_items` · `house_draw` · `house_export`

Resources: `hoq://house`, `hoq://report`, `hoq://report.md`, `hoq://drawing.svg`. Prompt: `qfd_session`.
