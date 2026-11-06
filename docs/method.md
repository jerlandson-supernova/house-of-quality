# The method, step by step

This is how we ran a House of Quality on a real product under review: a two-layer software build with sixteen stakeholder needs, twenty measurable characteristics, five gates and fifty tickets on two boards. The tool in this repository is what came out of it. The steps are in the order we did them, with what we learned at each one. Where a step has a formula, it is in `docs/formulas.md`.

## 1. Collect the needs, with their sources

Write each need in the stakeholder's own words, one line, and record who said it: the owner's pitch, a customer survey, returns data, a regulation, a safety review. The source matters twice: it tells you whom to ask when the need is unclear, and it tells a reader why the need is there at all.

Keep the list short enough to argue about. Sixteen was already a lot. If a need is really two, split it; if two needs are the same thing from two people, merge them and list both sources.

Give each need a short label (two to four words). The charts, the diagonal view and the TSV use it.

## 2. Define the characteristics, with units, directions and targets

A characteristic is something you can measure on the design: a temperature, a count, a percentage, a time. If you cannot say its unit, it is not a characteristic yet; it is a wish. Each one gets a direction (larger is better, smaller is better, meet a target) and a target value, written so that a stranger could test it.

Write "today" for each one: the measured state now, with its date. This is the most honest column in the house. Later, when a board says a ticket is done, this column is what you check it against.

## 3. Rate the room: 9, 3, 1 or blank

For every pair, ask: if this characteristic hits its target, how much of this need is met? 9 when the characteristic decides whether the need is met, 3 for a clear influence, 1 for some influence, blank otherwise. Most cells are blank; a dense room is a sign that the characteristics are not specific enough.

Rate with the team, in one sitting, out loud. The disagreements are the useful part. Record the ratings as drafts and say who drafted them.

Read the empty rows and columns before anything else (Hauser and Clausing 1988): a need with no relationship is unaddressed, a characteristic that drives nothing is unnecessary, and a need with no strong (9) driver has no owner.

## 4. Fill the roof

For pairs of characteristics, mark ++ or + where improving one helps the other, − or −− where it hurts. The roof is not scored. It is a list of design decisions: every trade-off is a choice someone has to make, and the Roof pairs tab is the list of those choices.

## 5. Score today against the goal

For each need, score where it stands today from 1 (poor) to 5 (excellent), and the goal for the next milestone. The ratio goal ÷ today, times the importance, says where the gap is widest. This is the "Importance × gap" weighting, a second reading of the room: switch it on to see which characteristics would move the needs that are furthest behind. Keep plain importance as the default; a need already met still matters.

## 6. Set the importance weights with the stakeholders

Importance is 1 to 5, set by the people whose needs they are, not by the team. We drafted the weights, sent the house, and the owner came back with their own set and a reason for each change. Those reasons go into the need's "why" field so the house records who moved what and why. Date the weights. From then on, the weights are "of record" and the rest of the house is still a draft.

## 7. Mark the gates

Some characteristics are not features to be ranked but conditions to be met: a safety limit, a legal rule, a test that must pass before anything ships. Mark them as gates. The house keeps their weighted importance, so you can still see how much of the room they carry, but it takes them out of the priority rank. Ranking a gate against a feature is how a safety item ends up at number nine on a list and gets traded away.

## 8. Read the basement

The basement gives each characteristic its weighted importance (the sum over needs of weight × relationship), its share of the total and its rank among the non-gates. The top five are the characteristics that carry the house. Read the rank with the roof: a top-five characteristic with a −− against another top-five one is a conflict at the centre of the design.

Send the house around as the dated TSV, with the scoring mode in its first row. We learned this the hard way: edits in a web page reach no one, and two people arguing from different versions waste a meeting. The TSV is the version of record; the JSON is the file you load to edit; the workbook is for the people who want formulas they can audit.

## 9. Diagonalise the room

Reorder the rows and columns so the relationships gather along the diagonal (`docs/diagonalization.md`). The blocks that appear are the modules of the design and the candidate owners; the relationships outside the blocks are the couplings, where one team's change moves another team's result. The coupling verdict (uncoupled, decoupled, coupled) says whether a build order exists, and the list of ties to cut says what to redesign if it does not.

In our case the strong relationships alone were decoupled: a clean build order with one crossing. Counting the weak relationships too, the design was coupled with seventeen ties on the smaller side, most of them through two platform-level characteristics. That told us which two things to settle first, which the rank alone had not.

## 10. Link the work and read the board against your tests

Put the ticket keys that will deliver each characteristic in its links field. The weighted importance of the characteristic is split over its tickets, so each ticket gets a share of the house: the fraction of what the stakeholders asked for that this one ticket carries. Sort by that share and you have a priority list that follows from the house rather than from whoever shouted last.

Then load the board: status, due date, effort. And add your own test verdict per ticket: verified, partial, failed, not built, not retested. The Work items tab reads the two against each other. "Done" on the board with "partial" from your tests is "done with open clauses"; "To Do" with "verified" is "understated". In our review, half the done tickets had open clauses, two to-do tickets were already proven, and one of our own earlier claims turned out to be wrong when matched against the tests. Keep the notes short and dated, with the evidence that produced the verdict.

## 11. Keep it alive

A house is a snapshot. Re-score "today" when the build moves, re-read the board each week, re-send the dated TSV. The weights change only when the stakeholders change them. The room cells change when the team learns something about the design. Everything else is bookkeeping.

## What to avoid

- Rating the room alone and presenting it as fact. It is a draft until the team has argued over it.
- Letting the team set the importance weights. They belong to the stakeholders.
- Ranking gates. A gate is pass or fail.
- Treating the diagonal as a score. A perfect diagonal means the characteristics are the needs restated in units.
- Trusting a board status. A status is a claim; a test is evidence.
- Sending a link to a live page as the version of record. Send the dated file.
