#!/usr/bin/env node
/* Checks the skills installer in a scratch project: install all six targets, list, re-install (no-op), edit one file and
 * see it kept, --force overwrite, uninstall leaves an edited file and removes the rest. Run: npm test */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./skills.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'hoq', 'SKILL.md'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoq-skills-'));
fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# My project\n\nKeep this paragraph.\n');
const r1 = S.install({ targets: 'all', dir, skill });
ok(r1.written.length === 6 && r1.skipped.length === 0, 'six pieces written: ' + JSON.stringify(r1));
['.claude/skills/hoq/SKILL.md', '.agents/skills/hoq/SKILL.md', '.cursor/rules/hoq.mdc', '.github/instructions/hoq.instructions.md', 'GEMINI.md', 'AGENTS.md'].forEach(f => ok(fs.existsSync(path.join(dir, f)), 'exists ' + f));
const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
ok(agents.startsWith('# My project') && agents.includes('Keep this paragraph.') && agents.includes(S.MARK0) && agents.includes(S.MARK1), 'AGENTS.md keeps its own text and gains the section');
ok(fs.readFileSync(path.join(dir, '.cursor/rules/hoq.mdc'), 'utf8').startsWith('---\ndescription:'), 'cursor frontmatter');
ok(fs.readFileSync(path.join(dir, '.github/instructions/hoq.instructions.md'), 'utf8').startsWith('---\napplyTo: "**"'), 'copilot frontmatter');
ok(fs.readFileSync(path.join(dir, '.claude/skills/hoq/SKILL.md'), 'utf8') === skill, 'claude skill verbatim');
const l1 = S.list({ dir }); ok(l1.entries.length === 6 && l1.entries.every(e => e.state === 'intact'), 'list: six intact');
const r2 = S.install({ targets: 'all', dir, skill }); ok(r2.written.length === 6 && r2.kept.length === 0, 're-install is a no-op');
// the user edits two pieces
const cursorFile = path.join(dir, '.cursor/rules/hoq.mdc'); fs.appendFileSync(cursorFile, '\nMy own rule.\n');
const gem = path.join(dir, 'GEMINI.md'); fs.writeFileSync(gem, fs.readFileSync(gem, 'utf8').replace('# House of Quality', '# House of Quality (edited)'));
const l2 = S.list({ dir }); ok(l2.entries.filter(e => e.state === 'edited').length === 2, 'list sees two edited: ' + l2.entries.map(e => e.state).join(','));
const r3 = S.install({ targets: 'all', dir, skill }); ok(r3.kept.length === 2 && r3.written.length === 4, 'install keeps the two edited pieces: ' + JSON.stringify(r3.kept.map(k => k.why)));
ok(fs.readFileSync(cursorFile, 'utf8').includes('My own rule.'), 'edited cursor file untouched');
const r4 = S.install({ targets: ['cursor'], dir, skill, force: true }); ok(r4.written.length === 1 && !fs.readFileSync(cursorFile, 'utf8').includes('My own rule.'), '--force overwrites');
const dry = S.install({ targets: ['claude'], dir: fs.mkdtempSync(path.join(os.tmpdir(), 'hoq-dry-')), skill, dryRun: true }); ok(dry.written.length === 1 && !fs.existsSync(dry.written[0].file), 'dry run writes nothing');
// uninstall: the edited GEMINI section stays, the rest goes, AGENTS.md keeps its own text
const u = S.uninstall({ dir });
ok(u.kept.length === 1 && u.kept[0].file === gem, 'uninstall keeps the edited section: ' + JSON.stringify(u.kept));
ok(!fs.existsSync(path.join(dir, '.claude')) && !fs.existsSync(path.join(dir, '.agents')) && !fs.existsSync(cursorFile) && !fs.existsSync(path.join(dir, '.github/instructions/hoq.instructions.md')), 'files and empty folders removed');
const agents2 = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'); ok(agents2.includes('Keep this paragraph.') && !agents2.includes(S.MARK0), 'AGENTS.md section removed, own text kept');
ok(fs.existsSync(path.join(dir, '.hoq-skills.json')) && S.list({ dir }).entries.length === 1, 'manifest keeps only the kept entry');
const u2 = S.uninstall({ dir, force: true }); ok(u2.removed.length === 1 && !fs.existsSync(gem) && !fs.existsSync(path.join(dir, '.hoq-skills.json')), 'force uninstall removes the rest and the manifest');
// user scope: project-only targets are skipped, nothing written to a fake home
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hoq-home-')); const realHome = os.homedir; os.homedir = () => home;
const ru = S.install({ targets: 'all', dir, skill, scope: 'user' });
ok(ru.written.length === 3 && ru.skipped.length === 3 && fs.existsSync(path.join(home, '.claude/skills/hoq/SKILL.md')) && fs.existsSync(path.join(home, '.gemini/GEMINI.md')), 'user scope: claude, codex, gemini only: ' + JSON.stringify(ru.written.map(w => w.target)));
S.uninstall({ scope: 'user', dir }); ok(!fs.existsSync(path.join(home, '.claude/skills/hoq/SKILL.md')), 'user uninstall');
os.homedir = realHome;
fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true });
if (fails) { console.error(fails, 'skills checks failed'); process.exit(1); }
console.log('skills checks ok');
