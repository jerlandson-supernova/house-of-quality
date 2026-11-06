# Diagonalising the room

The room of a House of Quality is a matrix: needs down the side, characteristics across the top, a 9, 3, 1 or blank in each cell. The order of the rows and the columns carries no information. Shuffle them and every weight, rank and roof pair stays the same. What changes is what the eye can see. Diagonalising means choosing a row order and a column order so that each need sits beside the characteristics that chiefly serve it, and the relationships gather along the line from the top-left corner to the bottom-right. Three things then show that the listed order hides.

- **Blocks.** Groups of needs served by the same group of characteristics, with little outside the group: the natural modules of the design, and candidate owners.
- **Couplings.** Relationships that no ordering brings to the diagonal: a characteristic that serves needs in several blocks, or a need that depends on several blocks. These are where one team's change moves another team's result.
- **Shape.** Axiomatic Design (Suh 1990) reads a design matrix by its shape. Diagonal is *uncoupled*: each need has its own characteristic. Triangular is *decoupled*: there is an order in which to settle the characteristics so that each need is met once and not revisited. Anything else is *coupled*, and the design iterates. A room with more characteristics than needs is a *redundant* design in Suh's terms; that is fine, and the extra columns are the ones to question first.

## The method

1. **Positions.** Row *i* gets `p_i = position ÷ (n − 1)` and column *j* gets `q_j = position ÷ (m − 1)`, so a rectangular matrix has a diagonal from corner to corner. The cost of an order is `J = Σ r_ij (p_i − q_j)²`, the weighted squared distance of the relationships from that diagonal.
2. **Spectral order.** Minimising `J` over all orders is NP-hard (it is seriation). Let the positions be real numbers instead and the minimiser is the second eigenvector of the Laplacian of the bipartite graph that has a node per need, a node per characteristic and an edge of weight `r_ij` between them: the Fiedler vector (Atkins, Boman and Hendrickson 1998), equivalently the second singular vectors of the degree-normalised matrix (Dhillon 2001). Sorting rows and columns by their coordinates gives the spectral order. Parts of the house that share no relationship are ordered separately, largest first; empty rows and columns go last. The implementation is a power iteration with the first singular pair deflated, started from the listed order so that a near-tie resolves towards the order the team wrote.
3. **Local search.** From the spectral order, move one row or one column at a time to the position that lowers `J` most, until no move helps; the same idea as the bond-energy algorithm (McCormick, Schweitzer and White 1972) and King's rank-order clustering (1980), with `J` as the score. Both orders of a diagonal are equally diagonal when reversed, so the result is flipped to read in the direction closest to the listed one.
4. **Blocks.** Cut the ordered rows and columns into *k* diagonal blocks to maximise bipartite modularity (Barber 2007): the mass inside the blocks beyond what the row and column totals would put there by chance, `Q = Σ_blocks (mass_inside ÷ M − row_mass × column_mass ÷ M²)`. `Q` is additive over blocks, so dynamic programming finds the exact optimum for a given order and *k*. The number of blocks is the one with the highest `Q`, unless fixed.
5. **Coupling.** Count the relationships that fall outside their block. None: uncoupled. All on one side of the diagonal: decoupled, and the side says which blocks to settle first. Both sides: coupled, and the smaller side is the set of ties to design away or to accept as iteration (Benavides and Rodríguez 2011, after Suh's own reorganisation algorithm). The ● level and the full 9/3/1 level are read separately, because QFD practice treats the strong relationships as the structure and the weaker ones as influence.

Everything above is in `web/hoq-core.js` (`diagonalize`, `spectral`, `blocks`), with no library. The page's Diagonal tab recomputes it on every edit; `tools/hoq.js diag` prints the same result for the workbook.

## How to read it, and the caveats

- A block is a candidate module and a candidate owner: its needs are met by its characteristics. Whether the blocks follow your team structure, or cut across it, is itself a finding.
- A characteristic with much of its weight outside its block is platform-level: change it and several blocks move. The priority rank alone does not show this.
- A need spread across blocks has no single home. Ask whether it is really two needs, or whether a characteristic is missing.
- A perfect diagonal is not the goal of a QFD room. If every need had exactly one characteristic, the characteristics would be the needs restated in units and the house would have found nothing. Diagonalising is for seeing structure, not for scoring it.
- The order is a mathematical result of the ratings. Change a rating and the order can change. The page recomputes live, while the House keeps the order you applied until you apply it again.
- A roof trade-off (− or −−) inside a block is a design decision for that block's owner; across blocks it is a negotiation between owners.
- For square matrices, Rinderle's reangularity and semangularity (1982) score coupling as angles between the columns; they do not apply to a rectangular room, so the measures here are the share of weight inside the blocks and the mean distance from the diagonal.

## Sources

- Hauser, J. R. and Clausing, D., [The House of Quality](https://hbr.org/1988/05/the-house-of-quality), Harvard Business Review 66(3), 63–73, 1988: the room, the roof and how to read empty rows and columns.
- Suh, N. P., *The Principles of Design*, Oxford, 1990: the independence axiom; uncoupled, decoupled and coupled design matrices. Summarised with the reorganisation algorithm in Benavides, E. M. and Rodríguez, L. G., [Extended algorithm for design-matrix reorganization](https://www.axiomaticdesign.com/wp-content/uploads/icad-2011-paper3-benavides-and-rodriguez.pdf), ICAD 2011.
- Atkins, J. E., Boman, E. G. and Hendrickson, B., [A spectral algorithm for seriation and the consecutive ones problem](https://doi.org/10.1137/S0097539795285771), SIAM J. Comput. 28(1), 297–310, 1998.
- Dhillon, I. S., [Co-clustering documents and words using bipartite spectral graph partitioning](https://doi.org/10.1145/502512.502550), KDD 2001: the same ordering applied to a rectangular matrix with rows and columns of different kinds.
- McCormick, W. T., Schweitzer, P. J. and White, T. W., [Problem decomposition and data reorganization by a clustering technique](https://econpapers.repec.org/RePEc:inm:oropre:v:20:y:1972:i:5:p:993-1009), Operations Research 20(5), 993–1009, 1972: the bond-energy algorithm.
- King, J. R., [Machine-component group formation in group technology](https://econpapers.repec.org/RePEc:eee:jomega:v:8:y:1980:i:2:p:193-199), Omega 8(2), 193–199, 1980: rank-order clustering of a part–machine matrix into blocks.
- Barber, M. J., [Modularity and community detection in bipartite networks](https://doi.org/10.1103/PhysRevE.76.066102), Physical Review E 76, 066102, 2007: the modularity used to pick the blocks.
- Eppinger, S. D. and Browning, T. R., [Design Structure Matrix Methods and Applications](https://en.wikipedia.org/wiki/Design_structure_matrix), MIT Press, 2012: clustering and sequencing of square dependency matrices, the DSM cousin of this view.
