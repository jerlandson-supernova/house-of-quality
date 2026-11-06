window.HOQ_SAMPLE={
 "title": "Commuter travel mug",
 "subtitle": "What commuters need from a travel mug (rows) against the measurable things the design must hit (columns). A small sample house to try the tool with.",
 "meta": {
  "date": "2026-11-05",
  "author": "sample data",
  "todayLabel": "current prototype",
  "scale": "1 poor to 5 excellent",
  "notes": [
   {
    "term": "Importance",
    "text": "5 essential, 4 very important, 3 important, 2 nice to have, 1 minor. Set with the stakeholders, not by the team alone."
   },
   {
    "term": "Gates",
    "text": "Leak and surface temperature are safety gates: a mug that fails either does not ship, whatever its weight in the room."
   }
  ],
  "boardRead": "",
  "boardSource": ""
 },
 "needs": [
  {
   "id": "W1",
   "need": "Coffee is still hot two hours after filling",
   "short": "Hot for two hours",
   "source": "Commuter survey",
   "importance": 5,
   "today": 3,
   "goal": 5,
   "links": "MUG-1, MUG-2",
   "why": "The most common complaint about the current prototype."
  },
  {
   "id": "W2",
   "need": "Nothing leaks into a bag, even lying on its side",
   "short": "Never leaks",
   "source": "Returns data",
   "importance": 5,
   "today": 2,
   "goal": 5,
   "links": "MUG-3",
   "why": "Leaks are the top reason for returns."
  },
  {
   "id": "W3",
   "need": "Fits the cup holder of a small car",
   "short": "Fits a cup holder",
   "source": "Dealer feedback",
   "importance": 3,
   "today": 4,
   "goal": 5,
   "links": "MUG-4",
   "why": ""
  },
  {
   "id": "W4",
   "need": "Can be opened and closed with one hand while driving",
   "short": "One-handed lid",
   "source": "Commuter survey",
   "importance": 4,
   "today": 2,
   "goal": 4,
   "links": "MUG-5",
   "why": ""
  },
  {
   "id": "W5",
   "need": "Does not burn the hand that holds it",
   "short": "Cool to hold",
   "source": "Safety review",
   "importance": 5,
   "today": 4,
   "goal": 5,
   "links": "MUG-2",
   "why": ""
  },
  {
   "id": "W6",
   "need": "Comes apart and goes in the dishwasher",
   "short": "Easy to clean",
   "source": "Customer interviews",
   "importance": 3,
   "today": 2,
   "goal": 4,
   "links": "MUG-6",
   "why": ""
  },
  {
   "id": "W7",
   "need": "Survives being dropped on concrete",
   "short": "Survives a drop",
   "source": "Warranty claims",
   "importance": 3,
   "today": 3,
   "goal": 4,
   "links": "MUG-7",
   "why": ""
  },
  {
   "id": "W8",
   "need": "Costs no more than the leading brand",
   "short": "Affordable",
   "source": "Pricing",
   "importance": 4,
   "today": 3,
   "goal": 4,
   "links": "MUG-8",
   "why": ""
  }
 ],
 "characteristics": [
  {
   "id": "H1",
   "name": "Temperature after two hours at 20 °C room temperature",
   "short": "Temperature after 2 h",
   "unit": "°C",
   "direction": "↑",
   "target": "≥ 70 °C from a 90 °C fill",
   "targetShort": "≥ 70 °C",
   "today": "61 °C on the prototype",
   "todayShort": "61 °C",
   "links": "MUG-1",
   "difficulty": 4,
   "gate": false
  },
  {
   "id": "H2",
   "name": "Vacuum wall thickness",
   "short": "Wall thickness",
   "unit": "mm",
   "direction": "◎",
   "target": "Double wall, 1.5 mm each, vacuum between",
   "targetShort": "1.5 mm",
   "today": "1.2 mm",
   "todayShort": "1.2 mm",
   "links": "MUG-1, MUG-2",
   "difficulty": 3,
   "gate": false
  },
  {
   "id": "H3",
   "name": "Leak test: pressure held with the lid closed, mug on its side",
   "short": "Leak test pressure",
   "unit": "kPa",
   "direction": "↑",
   "target": "≥ 30 kPa for 10 minutes",
   "targetShort": "≥ 30 kPa",
   "today": "Fails at 12 kPa",
   "todayShort": "12 kPa",
   "links": "MUG-3",
   "difficulty": 3,
   "gate": true
  },
  {
   "id": "H4",
   "name": "Base diameter",
   "short": "Base diameter",
   "unit": "mm",
   "direction": "◎",
   "target": "≤ 72 mm",
   "targetShort": "≤ 72 mm",
   "today": "74 mm",
   "todayShort": "74 mm",
   "links": "MUG-4",
   "difficulty": 1,
   "gate": false
  },
  {
   "id": "H5",
   "name": "Force to open the lid with a thumb",
   "short": "Lid opening force",
   "unit": "N",
   "direction": "↓",
   "target": "≤ 8 N, and closes with a click",
   "targetShort": "≤ 8 N",
   "today": "14 N, two hands",
   "todayShort": "14 N",
   "links": "MUG-5",
   "difficulty": 3,
   "gate": false
  },
  {
   "id": "H6",
   "name": "Outer surface temperature with a 90 °C fill",
   "short": "Outer surface temp.",
   "unit": "°C",
   "direction": "↓",
   "target": "≤ 40 °C",
   "targetShort": "≤ 40 °C",
   "today": "43 °C",
   "todayShort": "43 °C",
   "links": "MUG-2",
   "difficulty": 2,
   "gate": true
  },
  {
   "id": "H7",
   "name": "Parts the user takes apart to clean",
   "short": "Parts to clean",
   "unit": "count",
   "direction": "↓",
   "target": "≤ 3, all dishwasher safe",
   "targetShort": "≤ 3",
   "today": "5, lid not dishwasher safe",
   "todayShort": "5",
   "links": "MUG-6",
   "difficulty": 2,
   "gate": false
  },
  {
   "id": "H8",
   "name": "Drops from 1.2 m onto concrete survived without a leak",
   "short": "Drops survived",
   "unit": "count of 5",
   "direction": "↑",
   "target": "5 of 5",
   "targetShort": "5 of 5",
   "today": "3 of 5",
   "todayShort": "3 of 5",
   "links": "MUG-7",
   "difficulty": 3,
   "gate": false
  },
  {
   "id": "H9",
   "name": "Unit cost at 10,000 units",
   "short": "Unit cost",
   "unit": "$",
   "direction": "↓",
   "target": "≤ $9.50",
   "targetShort": "≤ $9.50",
   "today": "$10.80",
   "todayShort": "$10.80",
   "links": "MUG-8",
   "difficulty": 4,
   "gate": false
  },
  {
   "id": "H10",
   "name": "Weight when empty",
   "short": "Empty weight",
   "unit": "g",
   "direction": "↓",
   "target": "≤ 320 g",
   "targetShort": "≤ 320 g",
   "today": "345 g",
   "todayShort": "345 g",
   "links": "MUG-2",
   "difficulty": 2,
   "gate": false
  }
 ],
 "relationships": {
  "W1": {
   "H1": 9,
   "H2": 9,
   "H10": 1
  },
  "W2": {
   "H3": 9,
   "H5": 3,
   "H7": 1
  },
  "W3": {
   "H4": 9,
   "H10": 1
  },
  "W4": {
   "H5": 9,
   "H3": 3
  },
  "W5": {
   "H6": 9,
   "H2": 3
  },
  "W6": {
   "H7": 9,
   "H3": 1
  },
  "W7": {
   "H8": 9,
   "H2": 3,
   "H10": 3
  },
  "W8": {
   "H9": 9,
   "H2": 3,
   "H10": 1
  }
 },
 "roof": {
  "H1|H2": "++",
  "H2|H6": "+",
  "H2|H9": "−",
  "H2|H10": "−",
  "H3|H5": "−",
  "H3|H7": "−",
  "H7|H9": "+",
  "H8|H10": "−",
  "H4|H10": "+"
 },
 "items": {
  "MUG-1": {
   "title": "Thicker vacuum wall and a new seal at the neck",
   "status": "In Progress",
   "due": "2026-11-20",
   "effort": "5",
   "tested": "partial",
   "retested": "2026-11-03",
   "updated": "",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": "Second prototype holds 66 °C at two hours; target is 70."
  },
  "MUG-2": {
   "title": "Double-wall tooling for the body",
   "status": "Done",
   "due": "2026-10-30",
   "effort": "8",
   "tested": "verified",
   "retested": "2026-10-30",
   "updated": "2026-10-28T17:12:00.000Z",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": "Tooling accepted on the 28 Oct sample."
  },
  "MUG-3": {
   "title": "Silicone lid gasket and a leak test rig",
   "status": "In Review",
   "due": "2026-11-01",
   "effort": "3",
   "tested": "fails",
   "retested": "2026-11-04",
   "updated": "",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": "Rig built; the gasket still fails at 12 kPa on its side."
  },
  "MUG-4": {
   "title": "Taper the base to 72 mm",
   "status": "To Do",
   "due": "2026-11-15",
   "effort": "1",
   "tested": "not built",
   "retested": "",
   "updated": "",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": ""
  },
  "MUG-5": {
   "title": "One-handed flip lid",
   "status": "In Progress",
   "due": "2026-11-25",
   "effort": "5",
   "tested": "",
   "retested": "",
   "updated": "",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": ""
  },
  "MUG-6": {
   "title": "Three-part lid, dishwasher safe",
   "status": "To Do",
   "due": "2026-12-05",
   "effort": "3",
   "tested": "not built",
   "retested": "",
   "updated": "",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": ""
  },
  "MUG-7": {
   "title": "Rubber base ring",
   "status": "Done",
   "due": "2026-10-25",
   "effort": "2",
   "tested": "partial",
   "retested": "2026-10-29",
   "updated": "2026-11-04T23:30:00.000Z",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": "4 of 5 drops survived; the fifth cracked the lid, not the body. Changed on the board after the test."
  },
  "MUG-8": {
   "title": "Second-source the stainless blank",
   "status": "In Progress",
   "due": "2026-11-30",
   "effort": "3",
   "tested": "",
   "retested": "",
   "updated": "",
   "resolved": "",
   "priority": "",
   "sprint": "",
   "note": ""
  }
 },
 "statusScale": {
  "To Do": 0,
  "In Progress": 0.35,
  "In Review": 0.6,
  "Staging": 0.8,
  "Done": 1
 },
 "blockNames": {},
 "narrative": {
  "criticalPath": [
   [
    "MUG-3",
    "The leak gate: nothing ships until the gasket holds 30 kPa on its side."
   ],
   [
    "MUG-1 with MUG-2",
    "Heat retention, the heaviest need; the tooling is done, the wall and seal are not."
   ],
   [
    "MUG-5",
    "The one-handed lid, which also loads the leak test."
   ]
  ],
  "findings": [
   "MUG-7 is Done on the board but passed 4 of 5 drops; the lid cracked, which belongs to MUG-5. The board changed it again after that test, so it needs a retest.",
   "MUG-3 is In Review while the gate still fails: review is not a pass."
  ]
 },
 "revision": 0,
 "provenance": {},
 "proposals": [],
 "proposalSeq": 0
};
