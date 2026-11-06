#!/usr/bin/env python3
"""Build the House of Quality workbook from a house JSON file, with live formulas.

Usage:  python3 tools/make_xlsx.py house.json out.xlsx [--no-diagonal] [--gap]

Sheets: HoQ (the house: roof, ceiling, room, right wall, basement with formulas), Diagonal (the room reordered along
the diagonal, cells linked to HoQ, live measures), Roof_Pairs, Legend, Needs, Characteristics, Items.
The Diagonal sheet needs node (it runs `node tools/hoq.js diag house.json` for the order); without node it is skipped.
Needs openpyxl:  python3 -m pip install openpyxl   (or into a folder: pip install --target ./pylib openpyxl, then PYTHONPATH=./pylib).
Every formula is listed in docs/formulas.md next to the number it produces.
"""
import json
import os
import subprocess
import sys

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = [a for a in sys.argv[1:] if a.startswith("--")]
if len(args) < 2:
    print(__doc__)
    sys.exit(1)
SRC, OUT = args[0], args[1]
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- the house (normalised the same way the page does it)
def normalize_with_node(path):
    """Ask the shared JavaScript core to normalise the file, so the sheet and the page agree on defaults."""
    script = ("const H=require(process.argv[1]);const fs=require('fs');const r=H.normalize(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));"
              "if(r.errors.length){console.error(r.errors.join('\\n'));process.exit(2);}process.stdout.write(JSON.stringify(r.house));")
    try:
        out = subprocess.run(["node", "-e", script, os.path.join(HERE, "..", "web", "hoq-core.js"), path], capture_output=True, text=True, check=True)
        return json.loads(out.stdout)
    except (OSError, subprocess.CalledProcessError) as e:
        if isinstance(e, subprocess.CalledProcessError) and e.stderr:
            raise SystemExit("The house has errors:\n" + e.stderr)
        return None

HOUSE = normalize_with_node(SRC)
if HOUSE is None:   # no node: a lighter normalisation in Python
    raw = json.load(open(SRC, encoding="utf-8"))
    HOUSE = {"title": raw.get("title", "House of Quality"), "subtitle": raw.get("subtitle", ""), "meta": raw.get("meta", {}),
             "needs": raw.get("needs", []), "characteristics": raw.get("characteristics", []), "relationships": raw.get("relationships", {}),
             "roof": raw.get("roof", {}), "items": raw.get("items", {}), "statusScale": raw.get("statusScale", {})}
    for i, w in enumerate(HOUSE["needs"]):
        w.setdefault("id", f"W{i+1}"); w.setdefault("short", w.get("need", "")); w.setdefault("source", ""); w.setdefault("importance", 3)
        w.setdefault("today", 1); w.setdefault("goal", 5); w.setdefault("links", ""); w.setdefault("why", "")
    for j, c in enumerate(HOUSE["characteristics"]):
        c.setdefault("id", f"H{j+1}"); c.setdefault("short", c.get("name", "")); c.setdefault("unit", ""); c.setdefault("direction", "↑")
        c.setdefault("target", ""); c.setdefault("targetShort", c["target"]); c.setdefault("today", ""); c.setdefault("todayShort", c["today"])
        c.setdefault("links", ""); c.setdefault("difficulty", 3); c.setdefault("gate", False)

W, C, REL, ROOF, ITEMS = HOUSE["needs"], HOUSE["characteristics"], HOUSE["relationships"], HOUSE["roof"], HOUSE.get("items", {})
META = HOUSE.get("meta", {}) or {}
TODAY_LABEL = META.get("todayLabel") or "today"
AS_OF = META.get("date") or ""
n, m = len(C), len(W)
GAP = "--gap" in flags

DIAG = None
if "--no-diagonal" not in flags and n > 1 and m > 1:
    try:
        out = subprocess.run(["node", os.path.join(HERE, "hoq.js"), "diag", SRC], capture_output=True, text=True, check=True)
        DIAG = json.loads(out.stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        print("note: node is not available or failed, so the Diagonal sheet is skipped (the page's Diagonal tab still works).")

# ---------------------------------------------------------------- geometry
C0 = 5                              # column E: first characteristic column; every characteristic spans two columns
def hc(j): return C0 + 2 * j
HOW_LAST = hc(n - 1) + 1
R_DIR, R_ID, R_HDR, R_UNIT = 23, 24, 25, 26
R_W0 = 27
R_WN = R_W0 + m - 1
R_TARGET = R_WN + 2
R_CUR, R_ABS, R_REL, R_GATE, R_RANK, R_DIFF, R_LINK = (R_TARGET + k for k in range(1, 8))
ROOF_TOP = R_DIR - (n - 1)
C_SP = HOW_LAST + 1
C_CUR, C_GOAL, C_RATIO, C_ADJ, C_ADJP, C_LINK, C_WT = (C_SP + k for k in range(1, 8))
if ROOF_TOP < 6:
    raise SystemExit(f"{n} characteristics need {n - 1} roof rows; this layout has room for 17. Split the house or raise R_DIR in the script.")

# ---------------------------------------------------------------- styles
NAVY, BLUE2, BLUE3, BLUE4 = "1F3864", "2F5597", "8EA9DB", "DDEBF7"
GREY, HEAD, YEL, PEACH, GREEN, GOLD = "F2F2F2", "D9E1F2", "FFF2CC", "FCE4D6", "E2EFDA", "FFD966"
thin = Side(style="thin", color="808080")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
BORDER_L = Border(left=Side(style="medium", color="000000"), right=thin, top=thin, bottom=thin)
def fill(c): return PatternFill("solid", fgColor=c)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
TOP = Alignment(vertical="top", wrap_text=True)
ROT = Alignment(horizontal="center", vertical="bottom", text_rotation=90, wrap_text=True)
ROT_C = Alignment(horizontal="center", vertical="center", text_rotation=90, wrap_text=True)

def put(ws, row, col, value=None, font=None, fl=None, border=None, align=None, fmt=None):
    c = ws.cell(row=row, column=col)
    if value is not None:
        c.value = value
    if font: c.font = font
    if fl: c.fill = fl
    if border: c.border = border
    if align: c.alignment = align
    if fmt: c.number_format = fmt
    return c

wb = Workbook()
ws = wb.active
ws.title = "HoQ"

# ---------------------------------------------------------------- title block
put(ws, 1, 1, f"{HOUSE['title']} — House of Quality (QFD)", Font(bold=True, size=16, color=NAVY))
put(ws, 2, 1, ((HOUSE.get("subtitle") or "") + (" " if HOUSE.get("subtitle") else "") +
               (f"Data as of {AS_OF}. " if AS_OF else "") +
               "Relationship: 9 strong, 3 medium, 1 weak, blank none. Roof: ++ / + / − / −−. Importance, today, goal, the room, the roof and "
               "difficulty are inputs (coloured cells); weights, ratios, shares and ranks are formulas. "
               + ("Weighting: importance × (goal ÷ today). " if GAP else "Weighting: importance. ")
               + "Must-pass gates keep their weight but are kept out of the rank. See the Legend sheet."), align=TOP)
ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=4)
ws.row_dimensions[2].height = 110
put(ws, 4, 1, "ROOF — correlations between characteristics", Font(bold=True, size=12))
put(ws, 5, 1, ("Each roof cell sits where the diagonals from two characteristic columns meet. Read it from the 'Roof_Pairs' sheet. "
               "Edit with the drop-down: ++ strong positive, + positive, − negative (trade-off), −− strong negative."), align=TOP)
ws.merge_cells(start_row=5, start_column=1, end_row=12, end_column=4)

# ---------------------------------------------------------------- roof
roof_cells = {}
for a in range(n):
    for b in range(a + 1, n):
        r = R_DIR - (b - a)
        c = C0 + a + b
        key = f"{C[a]['id']}|{C[b]['id']}"
        put(ws, r, c, ROOF.get(key) or None, Font(bold=True, size=9), fill(GREY), BORDER, CENTER)
        put(ws, r, c + 1, None, None, fill(GREY), BORDER)
        ws.merge_cells(start_row=r, start_column=c, end_row=r, end_column=c + 1)
        roof_cells[(a, b)] = f"{L(c)}{r}"
for r in range(ROOF_TOP, R_DIR):
    ws.row_dimensions[r].height = 15

# ---------------------------------------------------------------- ceiling
def label_row(r, text, height=None):
    put(ws, r, 1, text, Font(bold=True), fill(HEAD), BORDER, LEFT)
    for c in range(2, 5):
        put(ws, r, c, None, None, fill(HEAD), BORDER)
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    if height: ws.row_dimensions[r].height = height

label_row(R_DIR, "Direction of improvement  (↑ more is better · ↓ less is better · ◎ meet target)")
label_row(R_ID, "Characteristic #")
label_row(R_UNIT, "Units")
for j, h in enumerate(C):
    c = hc(j)
    put(ws, R_DIR, c, h["direction"], Font(bold=True, size=13), fill(HEAD), BORDER, CENTER)
    put(ws, R_DIR, c + 1, None, None, fill(HEAD), BORDER)
    put(ws, R_ID, c, h["id"], Font(bold=True), fill(HEAD), BORDER, CENTER)
    put(ws, R_ID, c + 1, None, None, fill(HEAD), BORDER)
    put(ws, R_HDR, c, h["name"], Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, ROT)
    put(ws, R_HDR, c + 1, None, None, fill(NAVY), BORDER)
    put(ws, R_UNIT, c, h["unit"], Font(italic=True, size=8), fill(HEAD), BORDER, CENTER)
    put(ws, R_UNIT, c + 1, None, None, fill(HEAD), BORDER)
    for r in (R_DIR, R_ID, R_HDR, R_UNIT):
        ws.merge_cells(start_row=r, start_column=c, end_row=r, end_column=c + 1)
ws.row_dimensions[R_HDR].height = 200
for c, t in zip(range(1, 5), ("#", "Stakeholder need (WHAT)", "Source", "Importance (1–5)")):
    put(ws, R_HDR, c, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)

put(ws, R_DIR, C_CUR, f"RIGHT WALL: {TODAY_LABEL.upper()} vs GOAL", Font(bold=True), fill(HEAD), BORDER, LEFT)
ws.merge_cells(start_row=R_DIR, start_column=C_CUR, end_row=R_DIR, end_column=C_WT)
put(ws, R_ID, C_CUR, "1 = poor · 5 = excellent", None, fill(HEAD), BORDER, LEFT)
ws.merge_cells(start_row=R_ID, start_column=C_CUR, end_row=R_ID, end_column=C_WT)
for c, t in ((C_CUR, f"{TODAY_LABEL.capitalize()} score (1–5)" + (f"\nas of {AS_OF}" if AS_OF else "")),
             (C_GOAL, "Goal score (1–5)"),
             (C_RATIO, f"Improvement ratio\n= goal ÷ {TODAY_LABEL}"),
             (C_ADJ, "Adjusted weight\n= importance × ratio"),
             (C_ADJP, "Adjusted weight (%)"),
             (C_LINK, "Links (work items)"),
             (C_WT, "Weight used in the room" + ("\n= importance × ratio" if GAP else "\n= importance"))):
    put(ws, R_HDR, c, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)

# ---------------------------------------------------------------- the room
for i, w in enumerate(W):
    r = R_W0 + i
    ws.row_dimensions[r].height = 32
    put(ws, r, 1, w["id"], Font(bold=True), None, BORDER, CENTER)
    put(ws, r, 2, w["need"], None, None, BORDER, LEFT)
    put(ws, r, 3, w.get("source", ""), Font(size=9), None, BORDER, LEFT)
    put(ws, r, 4, w["importance"], Font(bold=True, size=12), fill(PEACH), BORDER, CENTER)
    for j, h in enumerate(C):
        c = hc(j)
        v = (REL.get(w["id"]) or {}).get(h["id"])
        put(ws, r, c, v if v else None, Font(bold=True), None, BORDER_L if j == 0 else BORDER, CENTER)
        put(ws, r, c + 1, None, None, None, BORDER)
        ws.merge_cells(start_row=r, start_column=c, end_row=r, end_column=c + 1)
    put(ws, r, C_CUR, w["today"], None, fill(GREEN), BORDER, CENTER)
    put(ws, r, C_GOAL, w["goal"], None, fill(GREEN), BORDER, CENTER)
    cur, goal = f"{L(C_CUR)}{r}", f"{L(C_GOAL)}{r}"
    ratio, adj = f"{L(C_RATIO)}{r}", f"{L(C_ADJ)}{r}"
    put(ws, r, C_RATIO, f'=IF(OR({cur}="",{cur}=0),"",{goal}/{cur})', None, fill(GREEN), BORDER, CENTER, "0.00")
    put(ws, r, C_ADJ, f'=IF({ratio}="","",$D{r}*{ratio})', None, fill(GREEN), BORDER, CENTER, "0.0")
    put(ws, r, C_ADJP, f'=IF({adj}="","",{adj}/SUM(${L(C_ADJ)}${R_W0}:${L(C_ADJ)}${R_WN}))', None, fill(GREEN), BORDER, CENTER, "0%")
    put(ws, r, C_LINK, w.get("links", ""), Font(size=8), None, BORDER, LEFT)
    put(ws, r, C_WT, (f'=IF({ratio}="",$D{r},$D{r}*{ratio})' if GAP else f"=$D{r}"), Font(color="008000"), fill(GREEN), BORDER, CENTER, "0.0")

# ---------------------------------------------------------------- basement
def base_row(r, text, height=None):
    put(ws, r, 1, text, Font(bold=True), fill(YEL), BORDER, LEFT)
    for c in range(2, 5):
        put(ws, r, c, None, None, fill(YEL), BORDER)
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    if height: ws.row_dimensions[r].height = height

base_row(R_TARGET, "Target value (short form; the full target is on the Characteristics sheet)", 120)
base_row(R_CUR, f"{TODAY_LABEL.capitalize()} (short form; full text on the Characteristics sheet)", 120)
base_row(R_ABS, "Absolute weighted importance = Σ (need weight × relationship)", 30)
base_row(R_REL, "Relative weight (%)")
base_row(R_GATE, "Must-pass gate — kept out of the rank")
base_row(R_RANK, "Priority rank (1 = most important of the ranked characteristics; gates show 'gate')")
base_row(R_DIFF, "Technical difficulty (1–5)")
base_row(R_LINK, "Links (work items)", 100)
wt_rng = f"${L(C_WT)}${R_W0}:${L(C_WT)}${R_WN}"
abs_rng = f"${L(C0)}${R_ABS}:${L(HOW_LAST)}${R_ABS}"
gate_rng = f"${L(C0)}${R_GATE}:${L(HOW_LAST)}${R_GATE}"
for j, h in enumerate(C):
    c = hc(j)
    col = L(c)
    put(ws, R_TARGET, c, h.get("targetShort", ""), Font(size=8), fill(YEL), BORDER, ROT_C)
    put(ws, R_CUR, c, h.get("todayShort", ""), Font(size=8), fill(YEL), BORDER, ROT_C)
    put(ws, R_ABS, c, f"=SUMPRODUCT({wt_rng},{col}{R_W0}:{col}{R_WN})", Font(bold=True), fill(YEL), BORDER, CENTER, "0.0")
    put(ws, R_REL, c, f"={col}{R_ABS}/SUM({abs_rng})", None, fill(YEL), BORDER, CENTER, "0%")
    g = bool(h.get("gate"))
    put(ws, R_GATE, c, "gate" if g else None, Font(bold=True, color="FFFFFF") if g else None, fill("C00000") if g else fill(YEL), BORDER, CENTER)
    put(ws, R_RANK, c, f'=IF({col}{R_GATE}<>"","gate",1+SUMPRODUCT(({gate_rng}="")*({abs_rng}>{col}{R_ABS})))', Font(bold=True, color="C00000"), fill(YEL), BORDER, CENTER)
    put(ws, R_DIFF, c, h.get("difficulty", 3), None, fill(YEL), BORDER, CENTER)
    put(ws, R_LINK, c, h.get("links", ""), Font(size=8), fill(YEL), BORDER, ROT_C)
    for r in (R_TARGET, R_CUR, R_ABS, R_REL, R_GATE, R_RANK, R_DIFF, R_LINK):
        put(ws, r, c + 1, None, None, fill("C00000") if (r == R_GATE and g) else fill(YEL), BORDER)
        ws.merge_cells(start_row=r, start_column=c, end_row=r, end_column=c + 1)

# ---------------------------------------------------------------- widths, panes, validations, conditional formats
ws.column_dimensions["A"].width = 6
ws.column_dimensions["B"].width = 46
ws.column_dimensions["C"].width = 15
ws.column_dimensions["D"].width = 11
for c in range(C0, HOW_LAST + 1):
    ws.column_dimensions[L(c)].width = 3.4
ws.column_dimensions[L(C_SP)].width = 2
for c in (C_CUR, C_GOAL, C_RATIO, C_ADJ, C_ADJP, C_WT):
    ws.column_dimensions[L(c)].width = 11
ws.column_dimensions[L(C_LINK)].width = 28
ws.freeze_panes = f"{L(C0)}{R_W0}"
ws.sheet_view.zoomScale = 85
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.sheet_properties.pageSetUpPr.fitToPage = True

room = f"{L(C0)}{R_W0}:{L(HOW_LAST)}{R_WN}"
roof = f"{L(C0)}{ROOF_TOP}:{L(HOW_LAST)}{R_DIR - 1}"
dv = DataValidation(type="list", formula1='"9,3,1"', allow_blank=True, showErrorMessage=True, errorTitle="Relationship", error="Use 9 (strong), 3 (medium), 1 (weak), or leave blank.")
dv.add(room); ws.add_data_validation(dv)
dv = DataValidation(type="list", formula1='"++,+,−,−−"', allow_blank=True, showErrorMessage=False)
dv.add(roof); ws.add_data_validation(dv)
for rng in (f"D{R_W0}:D{R_WN}", f"{L(C_CUR)}{R_W0}:{L(C_GOAL)}{R_WN}", f"{L(C0)}{R_DIFF}:{L(HOW_LAST)}{R_DIFF}"):
    dv = DataValidation(type="whole", operator="between", formula1="1", formula2="5", allow_blank=True)
    dv.add(rng); ws.add_data_validation(dv)
ws.conditional_formatting.add(room, CellIsRule(operator="equal", formula=["9"], font=Font(bold=True, color="FFFFFF"), fill=fill(BLUE2)))
ws.conditional_formatting.add(room, CellIsRule(operator="equal", formula=["3"], font=Font(bold=True, color="000000"), fill=fill(BLUE3)))
ws.conditional_formatting.add(room, CellIsRule(operator="equal", formula=["1"], font=Font(color="404040"), fill=fill(BLUE4)))
top_left = f"{L(C0)}{ROOF_TOP}"
ws.conditional_formatting.add(roof, FormulaRule(formula=[f'EXACT({top_left},"++")'], fill=fill("63BE7B")))
ws.conditional_formatting.add(roof, FormulaRule(formula=[f'EXACT({top_left},"+")'], fill=fill("C6EFCE")))
ws.conditional_formatting.add(roof, FormulaRule(formula=[f'EXACT({top_left},"−")'], fill=fill("FFC7CE")))
ws.conditional_formatting.add(roof, FormulaRule(formula=[f'EXACT({top_left},"−−")'], fill=fill("F8696B")))
ws.conditional_formatting.add(f"{L(C0)}{R_RANK}:{L(HOW_LAST)}{R_RANK}", FormulaRule(formula=[f"AND(ISNUMBER({L(C0)}{R_RANK}),{L(C0)}{R_RANK}<=5)"], fill=fill(GOLD)))

# ---------------------------------------------------------------- Roof_Pairs
rp = wb.create_sheet("Roof_Pairs")
for c, t in enumerate(("A", "Characteristic A", "B", "Characteristic B", "Correlation (live from HoQ)", "Meaning"), 1):
    put(rp, 1, c, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
rr = 2
pairs = sorted(((a, b) for (a, b) in roof_cells if ROOF.get(f"{C[a]['id']}|{C[b]['id']}")), key=lambda t: t)
for a, b in pairs:
    ref = f"HoQ!{roof_cells[(a, b)]}"
    put(rp, rr, 1, C[a]["id"], Font(bold=True), None, BORDER, CENTER)
    put(rp, rr, 2, C[a]["name"], None, None, BORDER, LEFT)
    put(rp, rr, 3, C[b]["id"], Font(bold=True), None, BORDER, CENTER)
    put(rp, rr, 4, C[b]["name"], None, None, BORDER, LEFT)
    put(rp, rr, 5, f'=IF({ref}="","",{ref})', Font(bold=True), None, BORDER, CENTER)
    e = f"E{rr}"
    put(rp, rr, 6, (f'=IF({e}="++","Strong positive: improving one strongly helps the other",IF({e}="+","Positive: helps",'
                    f'IF({e}="−","Trade-off: improving one tends to hurt the other",IF({e}="−−","Strong trade-off",""))))'), None, None, BORDER, LEFT)
    rr += 1
put(rp, rr + 1, 1, "Only the pairs with a value are listed. Any other pair: the HoQ roof cell for a/b is (b−a) rows up from the 'Direction of improvement' row, centred between the two columns.", align=TOP)
rp.merge_cells(start_row=rr + 1, start_column=1, end_row=rr + 1, end_column=6)
rp.row_dimensions[rr + 1].height = 32
for c, wdt in zip("ABCDEF", (8, 52, 8, 52, 14, 56)):
    rp.column_dimensions[c].width = wdt
rp.freeze_panes = "A2"
if rr > 2:
    for v, colr in (("++", "63BE7B"), ("+", "C6EFCE"), ("−", "FFC7CE"), ("−−", "F8696B")):
        rp.conditional_formatting.add(f"E2:E{rr - 1}", FormulaRule(formula=[f'EXACT(E2,"{v}")'], fill=fill(colr)))

# ---------------------------------------------------------------- Legend
lg = wb.create_sheet("Legend")
L_ROWS = [
    ("House of Quality — how to read and edit", None, "title"),
    ("WHAT IT IS", ("A House of Quality (QFD matrix) links what the stakeholders need (WHATs, rows) to the measurable characteristics "
                    "of the design (HOWs, columns), and shows which characteristics matter most. The method step by step is in docs/method.md; "
                    "every formula in docs/formulas.md."), "sec"),
    (None, None, None),
    ("PARTS OF THE HOUSE", None, "sec"),
    ("Left wall (needs)", f"{m} stakeholder needs, each with a source and an Importance rating (1–5).", None),
    ("Ceiling (characteristics)", f"{n} measurable characteristics with units and a direction of improvement.", None),
    ("Room (relationship matrix)", "How strongly each characteristic drives each need: 9, 3, 1 or blank.", None),
    ("Roof (correlation matrix)", "How the characteristics help or fight each other. Triangle above the headers; listed on Roof_Pairs.", None),
    ("Right wall", f"{TODAY_LABEL.capitalize()} score vs goal score per need, giving an improvement ratio and an adjusted weight.", None),
    ("Basement", "Target, today's state, weighted importance, relative %, must-pass gate, rank, difficulty and the links per characteristic.", None),
    (None, None, None),
    ("SCORING", None, "sec"),
    ("Importance (1–5)", "5 essential, 4 very important, 3 important, 2 nice to have, 1 minor.", None),
    ("Must-pass gate", "A characteristic that must pass before anything ships, whatever its weight. It keeps its weighted importance but is never ranked against the others.", None),
    ("Relationship 9 / 3 / 1", "Strong (dark blue) / medium (mid blue) / weak (light blue); blank = no meaningful relationship. Symbols ● ○ △ on the web page.", None),
    ("Roof ++ / + / − / −−", "Strong positive / positive / trade-off / strong trade-off. A trade-off is a decision for the owner, not a silent default.", None),
    ("Direction ↑ / ↓ / ◎", "↑ larger is better · ↓ smaller is better · ◎ meet a specific target.", None),
    ("Weight used in the room", ("The right-wall column 'Weight used in the room' is the need's importance" +
                                 (", multiplied by goal ÷ today (the gap weighting, chosen with --gap)." if GAP else ". Generate with --gap to weight by importance × (goal ÷ today) instead.")), None),
    ("Absolute weighted importance", "Per characteristic: SUMPRODUCT of the weight column with the characteristic's column of the room.", None),
    ("Relative weight / Rank", "Share of the total; rank = 1 + the number of non-gate characteristics with a larger weight (gates show 'gate'). Top 5 ranks are highlighted.", None),
    ("Right-wall scores (1–5)", f"Ratio = goal ÷ {TODAY_LABEL}. Adjusted weight = importance × ratio, and its share: where the biggest gaps are.", None),
    (None, None, None),
    ("HOW TO EDIT", None, "sec"),
    ("Change a rating", "Type a new Importance (1–5) in column D, or a today/goal score on the right wall. Everything recalculates.", None),
    ("Change a relationship", "Click a room cell and pick 9, 3 or 1 from the drop-down (or Delete for none).", None),
    ("Change a roof cell", "Use the drop-down only (++, +, −, −−). Typing + or − directly makes Excel treat it as a formula.", None),
    ("Add a need", "Insert a row inside the need block (between the first and the last need) so the SUMPRODUCT ranges expand; copy formatting from the row above.", None),
    ("Add a characteristic", "Easiest: add it to the JSON (or the CSV files) and re-run tools/make_xlsx.py; the roof geometry depends on column positions.", None),
    ("Interactive version", "web/index.html in the repository: load the same JSON, click to edit, live charts, the Diagonal view and the work items.", None),
    (None, None, None),
    ("DIAGONAL SHEET", None, "sec"),
    ("What it shows", ("The same room with its rows and columns reordered so the relationships gather along the diagonal. Outlined blocks are the modules "
                       "(needs served by the same characteristics); dashed cells are relationships outside their block (couplings). The order of rows and "
                       "columns carries no information in a House of Quality, so nothing in the weights or ranks changes."), None),
    ("How the order is found", ("Spectral seriation (the Fiedler vector of the bipartite graph of needs and characteristics; Atkins, Boman and Hendrickson 1998; "
                                "Dhillon 2001) gives a first order; a local search then moves one row or column at a time while J = Σ r(i,j) × (p(i) − q(j))², the weighted "
                                "squared distance from the diagonal, falls. Blocks are cut to maximise bipartite modularity (Barber 2007). Coupling is read as in "
                                "Axiomatic Design (Suh 1990): no relationship outside the blocks = uncoupled; all on one side of the diagonal = decoupled (a build "
                                "order exists); both sides = coupled. Details and sources: docs/method.md."), None),
    ("Live and fixed", ("Cells, importance, column weights and ranks on the Diagonal sheet are links to the HoQ sheet, so edits there show here and the measures "
                        "recalculate. The order, the blocks and the verdicts were computed when the file was generated; after larger edits re-run tools/make_xlsx.py."), None),
]
notes = META.get("notes") or []
if notes:
    L_ROWS += [(None, None, None), ("NOTES ON THIS HOUSE", None, "sec")] + [(str(x.get("term", "")), str(x.get("text", "")), None) for x in notes if isinstance(x, dict)]
for r, (a, b, kind) in enumerate(L_ROWS, 1):
    if kind == "title":
        put(lg, r, 1, a, Font(bold=True, size=16, color=NAVY))
    elif kind == "sec":
        put(lg, r, 1, a, Font(bold=True, color=NAVY), align=TOP)
        if b: put(lg, r, 2, b, align=TOP)
    elif a:
        put(lg, r, 1, a, Font(bold=True), align=TOP)
        put(lg, r, 2, b, align=TOP)
lg.column_dimensions["A"].width = 30
lg.column_dimensions["B"].width = 110

# ---------------------------------------------------------------- Diagonal
if DIAG:
    dg = wb.create_sheet("Diagonal", 1)
    widx = {w["id"]: i for i, w in enumerate(W)}
    hidx = {h["id"]: j for j, h in enumerate(C)}
    wby = {w["id"]: w for w in W}
    hby = {h["id"]: h for h in C}
    rows_o, cols_o, k = DIAG["rows"], DIAG["cols"], DIAG["k"]
    rcuts = DIAG["rowCuts"] + [m]
    ccuts = DIAG["colCuts"] + [n]
    row_block = {wid: b for b in range(k) for wid in rows_o[rcuts[b]:rcuts[b + 1]]}
    col_block = {hid: b for b in range(k) for hid in cols_o[ccuts[b]:ccuts[b + 1]]}
    names = DIAG.get("names") or [""] * k
    blabel = lambda b: f"B{b + 1}" + (f" · {names[b]}" if names[b] else "")
    DC0 = 5
    DC_LAST = DC0 + n - 1
    DC_TOT, DC_IN, DC_OUT = DC_LAST + 2, DC_LAST + 3, DC_LAST + 4
    DR_BLK, DR_ID, DR_NAME = 12, 13, 14
    DR_W0 = 15
    DR_WN = DR_W0 + m - 1
    DR_CBLK, DR_CTOT, DR_CIN, DR_COUT, DR_CABS, DR_CRANK = (DR_WN + kk for kk in range(1, 7))
    DR_LIST0 = DR_CRANK + 3
    mat_rng = f"${L(DC0)}${DR_W0}:${L(DC_LAST)}${DR_WN}"
    hoq_room = f"HoQ!${L(C0)}${R_W0}:${L(HOW_LAST)}${R_WN}"
    medium = Side(style="medium", color="000000")
    dashed = Side(style="dashed", color="C00000")

    put(dg, 1, 1, "Diagonalised room — the same relationships, rows and columns reordered so they gather along the diagonal", Font(bold=True, size=14, color=NAVY))
    put(dg, 2, 1, ("Each cell is a link to the HoQ sheet (edit there). Outlined rectangles are the blocks: needs served by the same characteristics, the modules of the "
                   "design. A dashed cell is a relationship outside its block, a coupling between modules. The order, the blocks and the verdicts below were computed when "
                   "this file was generated (method in the Legend); the web page recomputes them live."), align=TOP)
    dg.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(DC_LAST, 8))
    dg.row_dimensions[2].height = 48

    def hoq_rng(a0, a1, b0, b1):
        return f"HoQ!${L(hc(b0))}${R_W0 + a0}:${L(hc(b1 - 1) + 1)}${R_W0 + a1 - 1}"
    blk_rngs = [f"{L(DC0 + ccuts[b])}{DR_W0 + rcuts[b]}:{L(DC0 + ccuts[b + 1] - 1)}{DR_W0 + rcuts[b + 1] - 1}" for b in range(k)]
    bb = DIAG.get("blocksBefore") or {}
    brc, bcc = (bb.get("rowCuts") or []) + [m], (bb.get("colCuts") or []) + [n]
    before_rngs = [hoq_rng(brc[b], brc[b + 1], bcc[b], bcc[b + 1]) for b in range(len(brc) - 1)] if bb else []
    DR_HELP = DR_LIST0 + 40 + 2 * (m + n)
    help_after = f"${L(DC0)}${DR_HELP + 1}:${L(DC_LAST)}${DR_HELP + m}"
    help_before = f"${L(DC0)}${DR_HELP + m + 3}:${L(DC_LAST)}${DR_HELP + 2 * m + 2}"
    meas = [
        ("Relationships inside the blocks", f"=({'+'.join('SUM(' + r_ + ')' for r_ in blk_rngs)})/SUM({mat_rng})", "0%",
         "as listed:", (f"=({'+'.join('SUM(' + r_ + ')' for r_ in before_rngs)})/SUM({hoq_room})" if before_rngs else DIAG["before"]["inBlock"]), "0%"),
        ("Mean distance from the diagonal", f"=SUMPRODUCT({mat_rng},{help_after})/SUM({mat_rng})", "0.0%",
         "as listed:", f"=SUMPRODUCT({mat_rng},{help_before})/SUM({mat_rng})", "0.0%"),
    ]
    put(dg, 4, 1, "MEASURES", Font(bold=True, color=NAVY))
    for r_, (lab, f1, fmt1, lab2, f2, fmt2) in enumerate(meas, 5):
        put(dg, r_, 1, lab, Font(bold=True), None, BORDER, LEFT)
        dg.merge_cells(start_row=r_, start_column=1, end_row=r_, end_column=3)
        put(dg, r_, 4, f1, Font(bold=True), fill(YEL), BORDER, CENTER, fmt1)
        put(dg, r_, 5, lab2, Font(italic=True, size=9), None, None, LEFT)
        dg.merge_cells(start_row=r_, start_column=5, end_row=r_, end_column=7)
        put(dg, r_, 8, f2, None, fill(GREY), BORDER, CENTER, fmt2)
        dg.merge_cells(start_row=r_, start_column=8, end_row=r_, end_column=9)
    tie = lambda t: f"{t['w']} ← {t['h']}"
    def verdict_text(cp, label):
        tot = len(cp["above"]) + len(cp["below"])
        if cp["verdict"] == "uncoupled":
            return f"Uncoupled: no {label}relationship leaves its block."
        if cp["verdict"] == "decoupled":
            ties = cp["above"] or cp["below"]
            seq = sorted({f"B{col_block[t['h']] + 1} before B{row_block[t['w']] + 1}" for t in ties})
            return f"Decoupled: {tot} {label}tie(s) cross blocks, all one way ({', '.join(tie(t) for t in ties[:4])}{' …' if len(ties) > 4 else ''}); settle {', '.join(seq)}."
        return (f"Coupled: {len(cp['above'])} {label}ties point one way and {len(cp['below'])} the other. Cutting the {len(cp['cut'])} on the smaller side "
                f"({', '.join(tie(t) for t in cp['cut'][:4])}{' …' if len(cp['cut']) > 4 else ''}; full list below) would give a clean build order.")
    put(dg, 7, 1, "Coupling, strong (●) only", Font(bold=True), None, BORDER, LEFT); dg.merge_cells("A7:C7")
    put(dg, 7, 4, verdict_text(DIAG["strong"], "strong "), None, None, BORDER, LEFT); dg.merge_cells(start_row=7, start_column=4, end_row=7, end_column=max(DC_LAST, 9))
    put(dg, 8, 1, "Coupling, counting ○ and △", Font(bold=True), None, BORDER, LEFT); dg.merge_cells("A8:C8")
    put(dg, 8, 4, verdict_text(DIAG["all"], ""), None, None, BORDER, LEFT); dg.merge_cells(start_row=8, start_column=4, end_row=8, end_column=max(DC_LAST, 9))
    put(dg, 9, 1, "Blocks", Font(bold=True), None, BORDER, LEFT); dg.merge_cells("A9:C9")
    put(dg, 9, 4, (f"{k} blocks, chosen by bipartite modularity (Q = {DIAG['after']['Q']:.2f}): " +
                   " · ".join(f"{blabel(b)} ({DIAG['sizes'][b][0]} needs × {DIAG['sizes'][b][1]} characteristics)" for b in range(k)) +
                   f". Needs with no strong (●) driver: {', '.join(DIAG['noStrongW']) or 'none'}. Characteristics driving nothing strongly: {', '.join(DIAG['noStrongH']) or 'none'}."),
        None, None, BORDER, LEFT)
    dg.merge_cells(start_row=9, start_column=4, end_row=9, end_column=max(DC_LAST, 9))
    for r_, hgt in ((7, 34), (8, 34), (9, 64)):
        dg.row_dimensions[r_].height = hgt

    for c_, t in zip(range(1, 5), ("Block", "#", "Need (WHAT)", "Importance (live)")):
        put(dg, DR_NAME, c_, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
    put(dg, DR_BLK, 1, "Block →", Font(bold=True), fill(HEAD), BORDER, LEFT); dg.merge_cells(start_row=DR_BLK, start_column=1, end_row=DR_BLK, end_column=4)
    put(dg, DR_ID, 1, "Characteristic #", Font(bold=True), fill(HEAD), BORDER, LEFT); dg.merge_cells(start_row=DR_ID, start_column=1, end_row=DR_ID, end_column=4)
    for b in range(k):
        c1, c2 = DC0 + ccuts[b], DC0 + ccuts[b + 1] - 1
        put(dg, DR_BLK, c1, blabel(b), Font(bold=True, size=9), fill(GOLD), BORDER, CENTER)
        for c_ in range(c1 + 1, c2 + 1):
            put(dg, DR_BLK, c_, None, None, fill(GOLD), BORDER)
        if c2 > c1:
            dg.merge_cells(start_row=DR_BLK, start_column=c1, end_row=DR_BLK, end_column=c2)
    for b_, hid in enumerate(cols_o):
        c_ = DC0 + b_
        put(dg, DR_ID, c_, hid, Font(bold=True), fill(HEAD), BORDER, CENTER)
        put(dg, DR_NAME, c_, hby[hid]["name"], Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, ROT)
    dg.row_dimensions[DR_NAME].height = 190
    for c_, t in ((DC_TOT, "Row total"), (DC_IN, "Inside its block"), (DC_OUT, "Outside its block (%)")):
        put(dg, DR_NAME, c_, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
    off_cells = set()
    for a_, wid in enumerate(rows_o):
        r_ = DR_W0 + a_
        hr = R_W0 + widx[wid]
        b = row_block[wid]
        put(dg, r_, 1, f"B{b + 1}", Font(bold=True, size=9), fill(GOLD), BORDER, CENTER)
        put(dg, r_, 2, wid, Font(bold=True), None, BORDER, CENTER)
        put(dg, r_, 3, wby[wid]["short"], None, None, BORDER, LEFT)
        put(dg, r_, 4, f"=HoQ!D{hr}", Font(color="008000"), None, BORDER, CENTER)
        for b_, hid in enumerate(cols_o):
            c_ = DC0 + b_
            src = f"HoQ!{L(hc(hidx[hid]))}{hr}"
            put(dg, r_, c_, f'=IF({src}="",0,{src})', Font(bold=True), None, BORDER, CENTER, "0;-0;")
            if (REL.get(wid) or {}).get(hid) and col_block[hid] != b:
                off_cells.add((r_, c_))
        c1, c2 = DC0 + ccuts[b], DC0 + ccuts[b + 1] - 1
        put(dg, r_, DC_TOT, f"=SUM({L(DC0)}{r_}:{L(DC_LAST)}{r_})", None, fill(GREY), BORDER, CENTER, "0")
        put(dg, r_, DC_IN, f"=SUM({L(c1)}{r_}:{L(c2)}{r_})", None, fill(GREY), BORDER, CENTER, "0")
        put(dg, r_, DC_OUT, f'=IF({L(DC_TOT)}{r_}=0,"",1-{L(DC_IN)}{r_}/{L(DC_TOT)}{r_})', None, fill(GREY), BORDER, CENTER, "0%")
    for r_, t in ((DR_CBLK, "Block"), (DR_CTOT, "Column total"), (DR_CIN, "Inside its block"), (DR_COUT, "Outside its block (%)"),
                  (DR_CABS, "Weighted importance (live from HoQ)"), (DR_CRANK, "Priority rank (live from HoQ)")):
        put(dg, r_, 1, t, Font(bold=True), fill(YEL), BORDER, LEFT)
        dg.merge_cells(start_row=r_, start_column=1, end_row=r_, end_column=4)
    for b_, hid in enumerate(cols_o):
        c_ = DC0 + b_
        col = L(c_)
        b = col_block[hid]
        r1, r2 = DR_W0 + rcuts[b], DR_W0 + rcuts[b + 1] - 1
        put(dg, DR_CBLK, c_, f"B{b + 1}", Font(bold=True, size=9), fill(GOLD), BORDER, CENTER)
        put(dg, DR_CTOT, c_, f"=SUM({col}{DR_W0}:{col}{DR_WN})", None, fill(YEL), BORDER, CENTER, "0")
        put(dg, DR_CIN, c_, f"=SUM({col}{r1}:{col}{r2})", None, fill(YEL), BORDER, CENTER, "0")
        put(dg, DR_COUT, c_, f'=IF({col}{DR_CTOT}=0,"",1-{col}{DR_CIN}/{col}{DR_CTOT})', None, fill(YEL), BORDER, CENTER, "0%")
        put(dg, DR_CABS, c_, f"=HoQ!{L(hc(hidx[hid]))}{R_ABS}", Font(color="008000", bold=True), fill(YEL), BORDER, CENTER, "0.0")
        put(dg, DR_CRANK, c_, f"=HoQ!{L(hc(hidx[hid]))}{R_RANK}", Font(color="008000", bold=True), fill(YEL), BORDER, CENTER)
    for a_ in range(m):
        for b_ in range(n):
            r_, c_ = DR_W0 + a_, DC0 + b_
            side = dashed if (r_, c_) in off_cells else thin
            l, rt, tp, bt = side, side, side, side
            rb, cb = row_block[rows_o[a_]], col_block[cols_o[b_]]
            if rb == cb:
                if a_ == rcuts[rb]: tp = medium
                if a_ == rcuts[rb + 1] - 1: bt = medium
                if b_ == ccuts[cb]: l = medium
                if b_ == ccuts[cb + 1] - 1: rt = medium
            dg.cell(row=r_, column=c_).border = Border(left=l, right=rt, top=tp, bottom=bt)
    plain = mat_rng.replace("$", "")
    dg.conditional_formatting.add(plain, CellIsRule(operator="equal", formula=["9"], font=Font(bold=True, color="FFFFFF"), fill=fill(BLUE2)))
    dg.conditional_formatting.add(plain, CellIsRule(operator="equal", formula=["3"], font=Font(bold=True, color="000000"), fill=fill(BLUE3)))
    dg.conditional_formatting.add(plain, CellIsRule(operator="equal", formula=["1"], font=Font(color="404040"), fill=fill(BLUE4)))
    dg.conditional_formatting.add(f"{L(DC0)}{DR_CRANK}:{L(DC_LAST)}{DR_CRANK}", FormulaRule(formula=[f"AND(ISNUMBER({L(DC0)}{DR_CRANK}),{L(DC0)}{DR_CRANK}<=5)"], fill=fill(GOLD)))

    r_ = DR_LIST0
    put(dg, r_, 1, "THE BLOCKS (at generation)", Font(bold=True, color=NAVY)); r_ += 1
    for c_, t in zip(range(1, 6), ("Block", "Name", "Needs", "Characteristics", "Inside")):
        put(dg, r_, c_, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
    r_ += 1
    for b in range(k):
        rw = rows_o[rcuts[b]:rcuts[b + 1]]
        cl = cols_o[ccuts[b]:ccuts[b + 1]]
        tot = sum((REL.get(w_) or {}).get(h_, 0) for w_ in rw for h_ in [h["id"] for h in C])
        inside = sum((REL.get(w_) or {}).get(h_, 0) for w_ in rw for h_ in cl)
        put(dg, r_, 1, f"B{b + 1}", Font(bold=True), fill(GOLD), BORDER, CENTER)
        put(dg, r_, 2, names[b] or f"block {b + 1}", Font(bold=True), None, BORDER, LEFT)
        put(dg, r_, 3, "; ".join(f"{w_} {wby[w_]['short']}" for w_ in rw), None, None, BORDER, LEFT)
        put(dg, r_, 4, "; ".join(f"{h_} {hby[h_]['name']}" for h_ in cl), None, None, BORDER, LEFT)
        dg.merge_cells(start_row=r_, start_column=4, end_row=r_, end_column=max(DC_LAST, 5))
        put(dg, r_, DC_TOT, (inside / tot) if tot else 0, None, None, BORDER, CENTER, "0%")
        dg.row_dimensions[r_].height = 48
        r_ += 1
    r_ += 1
    put(dg, r_, 1, "WHAT CROSSES THE BLOCKS (a quarter or more of the weight outside the own block, at generation)", Font(bold=True, color=NAVY)); r_ += 1
    for c_, t in zip(range(1, 6), ("#", "Characteristic / need", "Own block", "Outside", "Also in")):
        put(dg, r_, c_, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
    r_ += 1
    share = lambda x: (x["outside"] / x["total"]) if x["total"] else 0
    for x in sorted((x for x in DIAG["perCol"] if share(x) >= 0.25), key=share, reverse=True):
        put(dg, r_, 1, x["h"], Font(bold=True), None, BORDER, CENTER); put(dg, r_, 2, hby[x["h"]]["name"], None, None, BORDER, LEFT)
        put(dg, r_, 3, f"B{col_block[x['h']] + 1}", None, None, BORDER, CENTER); put(dg, r_, 4, share(x), None, None, BORDER, CENTER, "0%")
        put(dg, r_, 5, ", ".join(f"B{b + 1}" for b in x["blocks"] if b != col_block[x["h"]]), None, None, BORDER, LEFT); r_ += 1
    for x in sorted((x for x in DIAG["perRow"] if share(x) >= 0.25), key=share, reverse=True):
        put(dg, r_, 1, x["w"], Font(bold=True), None, BORDER, CENTER); put(dg, r_, 2, wby[x["w"]]["short"], None, None, BORDER, LEFT)
        put(dg, r_, 3, f"B{row_block[x['w']] + 1}", None, None, BORDER, CENTER); put(dg, r_, 4, share(x), None, None, BORDER, CENTER, "0%")
        put(dg, r_, 5, ", ".join(f"B{b + 1}" for b in x["blocks"] if b != row_block[x["w"]]), None, None, BORDER, LEFT); r_ += 1
    r_ += 1
    put(dg, r_, 1, "TIES TO CUT FOR A CLEAN BUILD ORDER (the smaller side of the diagonal, counting all relationships; at generation)", Font(bold=True, color=NAVY)); r_ += 1
    for c_, t in zip(range(1, 6), ("Need", "Short", "Characteristic", "Value", "Blocks")):
        put(dg, r_, c_, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
    r_ += 1
    for t in sorted(DIAG["all"]["cut"], key=lambda t: (-t["v"], widx[t["w"]])):
        put(dg, r_, 1, t["w"], Font(bold=True), None, BORDER, CENTER); put(dg, r_, 2, wby[t["w"]]["short"], None, None, BORDER, LEFT)
        put(dg, r_, 3, f"{t['h']} {hby[t['h']]['name']}", None, None, BORDER, LEFT); put(dg, r_, 4, t["v"], None, None, BORDER, CENTER)
        put(dg, r_, 5, f"B{row_block[t['w']] + 1} ← B{col_block[t['h']] + 1}", None, None, BORDER, CENTER); r_ += 1
    if r_ > DR_HELP - 2:
        raise SystemExit("Diagonal sheet: the lists run into the helper rows; raise DR_HELP in the script")
    put(dg, DR_HELP, 1, "Helper: distance from the diagonal in this order, |p(i) − q(j)| (used by the measure above)", Font(italic=True, size=9, color="808080"))
    put(dg, DR_HELP + m + 2, 1, "Helper: the same distance in the listed order of the HoQ sheet", Font(italic=True, size=9, color="808080"))
    for a_, wid in enumerate(rows_o):
        for b_, hid in enumerate(cols_o):
            pa, qb = (a_ / (m - 1) if m > 1 else 0), (b_ / (n - 1) if n > 1 else 0)
            pa0, qb0 = (widx[wid] / (m - 1) if m > 1 else 0), (hidx[hid] / (n - 1) if n > 1 else 0)
            put(dg, DR_HELP + 1 + a_, DC0 + b_, abs(pa - qb), Font(size=8, color="808080"), None, None, CENTER, "0.00")
            put(dg, DR_HELP + m + 3 + a_, DC0 + b_, abs(pa0 - qb0), Font(size=8, color="808080"), None, None, CENTER, "0.00")
    dg.column_dimensions["A"].width = 9
    dg.column_dimensions["B"].width = 7
    dg.column_dimensions["C"].width = 34
    dg.column_dimensions["D"].width = 13
    for c_ in range(DC0, DC_LAST + 1):
        dg.column_dimensions[L(c_)].width = 4.2
    dg.column_dimensions[L(DC_LAST + 1)].width = 2
    for c_ in (DC_TOT, DC_IN, DC_OUT):
        dg.column_dimensions[L(c_)].width = 11
    dg.freeze_panes = f"{L(DC0)}{DR_W0}"
    dg.sheet_view.zoomScale = 85

# ---------------------------------------------------------------- Needs, Characteristics, Items
nd = wb.create_sheet("Needs")
for c, t in enumerate(("#", "Need (WHAT)", "Source", "Why it matters", "Importance", TODAY_LABEL.capitalize(), "Goal", "Links"), 1):
    put(nd, 1, c, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
for i, w in enumerate(W):
    r = i + 2
    hr = R_W0 + i
    put(nd, r, 1, w["id"], Font(bold=True), None, BORDER, CENTER)
    put(nd, r, 2, w["need"], None, None, BORDER, LEFT)
    put(nd, r, 3, w.get("source", ""), None, None, BORDER, LEFT)
    put(nd, r, 4, w.get("why", ""), None, None, BORDER, LEFT)
    put(nd, r, 5, f"=HoQ!D{hr}", Font(color="008000"), None, BORDER, CENTER)
    put(nd, r, 6, f"=HoQ!{L(C_CUR)}{hr}", Font(color="008000"), None, BORDER, CENTER)
    put(nd, r, 7, f"=HoQ!{L(C_GOAL)}{hr}", Font(color="008000"), None, BORDER, CENTER)
    put(nd, r, 8, w.get("links", ""), None, None, BORDER, LEFT)
    nd.row_dimensions[r].height = 48
put(nd, m + 3, 2, "Importance, today and goal are links to the HoQ sheet (green). Edit them there.", Font(italic=True), align=TOP)
for c, wdt in zip("ABCDEFGH", (5, 52, 22, 70, 11, 10, 8, 30)):
    nd.column_dimensions[c].width = wdt
nd.freeze_panes = "A2"

hw = wb.create_sheet("Characteristics")
for c, t in enumerate(("#", "Characteristic (HOW)", "Units", "Direction", "Target", TODAY_LABEL.capitalize(), "Links", "Weighted importance", "Rank", "Difficulty", "Must-pass gate"), 1):
    put(hw, 1, c, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
for j, h in enumerate(C):
    r = j + 2
    col = L(hc(j))
    put(hw, r, 1, h["id"], Font(bold=True), None, BORDER, CENTER)
    put(hw, r, 2, h["name"], None, None, BORDER, LEFT)
    put(hw, r, 3, h.get("unit", ""), None, None, BORDER, LEFT)
    put(hw, r, 4, h.get("direction", "↑"), Font(bold=True), None, BORDER, CENTER)
    put(hw, r, 5, h.get("target", ""), None, None, BORDER, LEFT)
    put(hw, r, 6, h.get("today", ""), None, None, BORDER, LEFT)
    put(hw, r, 7, h.get("links", ""), None, None, BORDER, LEFT)
    put(hw, r, 8, f"=HoQ!{col}{R_ABS}", Font(color="008000"), None, BORDER, CENTER, "0.0")
    put(hw, r, 9, f"=HoQ!{col}{R_RANK}", Font(color="008000"), None, BORDER, CENTER)
    put(hw, r, 10, f"=HoQ!{col}{R_DIFF}", Font(color="008000"), None, BORDER, CENTER)
    put(hw, r, 11, f"=HoQ!{col}{R_GATE}", Font(color="008000", bold=True), None, BORDER, CENTER)
    hw.row_dimensions[r].height = 40
put(hw, n + 3, 2, "Weighted importance, rank, difficulty and gate are links to the HoQ sheet (green). Edit them there.", Font(italic=True), align=TOP)
for c, wdt in zip("ABCDEFGHIJK", (5, 44, 12, 9, 40, 40, 24, 12, 7, 10, 11)):
    hw.column_dimensions[c].width = wdt
hw.freeze_panes = "A2"

if ITEMS:
    it = wb.create_sheet("Items")
    for c, t in enumerate(("Key", "Title", "Status", "Due", "Effort", "Tested", "Note", "Linked from"), 1):
        put(it, 1, c, t, Font(bold=True, color="FFFFFF"), fill(NAVY), BORDER, CENTER)
    linked = {}
    for h in C:
        for tok in (h.get("links") or "").replace(";", ",").split(","):
            linked.setdefault(tok.strip(), []).append(h["id"])
    for w in W:
        for tok in (w.get("links") or "").replace(";", ",").split(","):
            linked.setdefault(tok.strip(), []).append(w["id"])
    for r, (key, x) in enumerate(ITEMS.items(), 2):
        for c, v in enumerate((key, x.get("title", ""), x.get("status", ""), x.get("due", ""), x.get("effort", ""), x.get("tested", ""), x.get("note", ""), ", ".join(linked.get(key, []))), 1):
            put(it, r, c, v, Font(bold=True) if c == 1 else None, None, BORDER, LEFT)
    for c, wdt in zip("ABCDEFGH", (12, 48, 14, 12, 8, 12, 60, 20)):
        it.column_dimensions[c].width = wdt
    it.freeze_panes = "A2"

wb.properties.title = HOUSE["title"]
wb.properties.creator = META.get("author") or "House of Quality"
wb.save(OUT)
print("wrote", OUT, "| characteristics", n, "needs", m, "| room", room, "| roof", roof, "| diagonal sheet", "yes" if DIAG else "no")
