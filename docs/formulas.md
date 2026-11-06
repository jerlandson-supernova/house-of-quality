# Formulas

Every number the page and the workbook show, where it comes from, and the spreadsheet cell that computes it. The JavaScript is `web/hoq-core.js`; the workbook is written by `tools/make_xlsx.py`.

Notation: need *i* has importance `imp_i`, today score `today_i` and goal `goal_i` (all 1 to 5); characteristic *j* has gate flag `gate_j`; the room cell `r_ij` is 9, 3, 1 or 0.

## The room

| Name | Formula | Notes |
|---|---|---|
| Relationship `r_ij` | 9 strong, 3 medium, 1 weak, blank none | The 9/3/1 scale of Hauser and Clausing. The 1 to 3 to 9 steps make a strong relationship count for three medium ones; a 5/3/1 scale flattens that. |
| Need weight `w_i` | `imp_i` (importance mode) or `imp_i × goal_i ÷ max(1, today_i)` (gap mode) | The gap mode pulls weight towards the needs that are furthest from their goal. Use it as a second reading, not the default: a need already met still matters. |

Workbook: the room is `HoQ!E27:…`; the weight column is "Weight used in the room" on the right wall, `=$D27` or `=$D27*ratio` when generated with `--gap`.

## The basement (per characteristic)

| Name | Formula | Workbook |
|---|---|---|
| Absolute weighted importance `A_j` | `Σ_i w_i × r_ij` | `=SUMPRODUCT(weight column, characteristic column)` |
| Relative weight | `A_j ÷ Σ_j A_j` | `=E_abs / SUM(abs row)` |
| Rank | `1 + count of non-gate characteristics k with A_k > A_j`; gates show `gate` | `=IF(gate<>"","gate",1+SUMPRODUCT((gate row="")*(abs row>E_abs)))` |
| Top five | rank 1 to 5 | conditional format on the rank row |

Ties share a rank (two characteristics with the same weight both rank 6, and the next is 8). Gates keep `A_j` and their share, so the "weight" of a gate still shows what it carries; they are only kept out of the rank, because a gate is a pass/fail condition and not a feature to trade.

## The right wall (per need)

| Name | Formula | Workbook |
|---|---|---|
| Improvement ratio | `goal_i ÷ max(1, today_i)` | `=IF(today="","",goal/today)` |
| Adjusted weight | `imp_i × ratio_i` | `=$D27*ratio` |
| Adjusted share | `adj_i ÷ Σ_i adj_i` | `=adj/SUM(adj column)` |

The adjusted share answers "where is the gap widest, weighted by how much it matters". It is the chart "Where the gap is widest".

## The roof

The roof holds `++`, `+`, `−`, `−−` or blank for each pair of characteristics. It is not summed into any score. A trade-off (`−`, `−−`) is a decision for the owner; the Roof pairs tab lists them. In the diagonal view, a trade-off inside a block belongs to that block's owner; across blocks it is a negotiation.

## Progress

| Name | Formula |
|---|---|
| Right wall progress | `Σ_i imp_i × min(1, (today_i − 1) ÷ (goal_i − 1)) ÷ Σ_i imp_i` |
| Status-weighted progress | over characteristics with at least one linked item: `Σ_j A_j × mean(statusScale[status of each linked item]) ÷ Σ_j A_j` |
| Coverage | `Σ_j A_j over characteristics with items ÷ Σ_j A_j` |
| Effort left | `Σ effort of items whose status weight < 1` |
| Past due | items with `due < meta.date` (or today when `meta.date` is empty) and status weight `< 1` |

The right-wall measure says how far the needs have moved from poor towards their goals, in the stakeholders' own scores. The status measure says what the board claims, weighted by how much of the house each item carries. When the two disagree by much, one of them is wrong, and it is usually the board.

## Work items

| Name | Formula |
|---|---|
| Item share | for each characteristic *j* that links the item, add `A_j ÷ (number of items j links to)`; divide by `Σ_j A_j` |
| Serves | the characteristics and needs whose links name the item; gates marked |
| Really done? | the status weight read against `tested`: done + verified = holds; done + partial = done with open clauses; done + failed or not built = overstated; not done + verified = understated; otherwise matches |

An item linked only from a need has no share: the weights live on the characteristics, and a need's links only say where to look.

## What to fill next

`nextCells` ranks the empty room cells. Most cells of a good house stay blank, so the ranking looks for structural gaps, not for fullness. For an empty cell between need *i* and characteristic *j*:

`score = imp_i × g_i × (1 + share_j) × e_j × k_j`

where `g_i` is 2 when the need has no relationship at all, 1.5 when it has none at 9, and 0.5 otherwise; `share_j` is the characteristic's relative weight; `e_j` is 1.5 when the characteristic drives nothing yet, else 1; `k_j` is 1.2 for a gate, else 1. Cells with a pending proposal are skipped. The result also lists the unaddressed needs, the needs with no strong driver and the characteristics driving nothing, which are the findings the score is built from.

## The diagonal view

Positions: row *i* at `p_i = position ÷ (n − 1)`, column *j* at `q_j = position ÷ (m − 1)`, both in `[0, 1]`.

| Name | Formula |
|---|---|
| Cost of an order | `J = Σ_ij r_ij (p_i − q_j)²` |
| Mean distance from the diagonal | `Σ_ij r_ij |p_i − q_j| ÷ Σ_ij r_ij` |
| Share inside the blocks | `Σ over blocks of the mass inside ÷ Σ_ij r_ij` |
| Bipartite modularity (Barber 2007) | `Q = Σ over blocks of ( mass_inside ÷ M − row_mass × column_mass ÷ M² )`, with `M = Σ_ij r_ij` |
| Coupling | relationships outside their block, split by side of the diagonal: none = uncoupled, one side = decoupled (a build order exists), both = coupled (the smaller side is the set of ties to cut) |

The order is found by spectral seriation (the second singular vectors of the degree-normalised matrix) followed by a local search that moves one row or column at a time while `J` falls; the blocks are cut by dynamic programming to maximise `Q` for the order, and the number of blocks is the one with the highest `Q` unless fixed. The reasoning and the sources are in `docs/diagonalization.md`.

Workbook: the Diagonal sheet computes the share inside the blocks and the mean distance live (`SUMPRODUCT` over helper matrices of `|p_i − q_j|` for the diagonal order and the listed order); the order, the blocks and the verdicts are fixed at generation.
