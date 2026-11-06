/* skills.js — install the hoq agent skill where each client reads it, and take it out again cleanly.
 *
 * Targets and where the skill lands (project scope; --user where the client has one):
 *   claude     .claude/skills/hoq/SKILL.md              --user: ~/.claude/skills/hoq/SKILL.md
 *   codex      .agents/skills/hoq/SKILL.md              --user: ~/.agents/skills/hoq/SKILL.md
 *   cursor     .cursor/rules/hoq.mdc                    (project only; Cursor's user rules live in its settings)
 *   copilot    .github/instructions/hoq.instructions.md (project only; applyTo: "**")
 *   gemini     GEMINI.md, a marked section               --user: ~/.gemini/GEMINI.md
 *   agents-md  AGENTS.md, a marked section               (project only)
 *   all        every target above
 *
 * A manifest (.hoq-skills.json in the project, or ~/.hoq-skills.json with --user) records every file and section written
 * with its hash. install skips a file the user has edited since (--force overwrites it); uninstall removes only files and
 * sections that still match what was written, and says which ones it left alone.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TARGETS = ['claude', 'codex', 'cursor', 'copilot', 'gemini', 'agents-md'];
const MARK0 = '<!-- hoq:start -->', MARK1 = '<!-- hoq:end -->';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const stripFront = md => md.replace(/^---[\s\S]*?---\n/, '');

/** The files and sections one target needs, given the skill text. scope: 'project' (dir) or 'user'. */
function plan(target, skill, dir, scope) {
  const home = os.homedir();
  const body = stripFront(skill);
  switch (target) {
    case 'claude': return [{ kind: 'file', file: path.join(scope === 'user' ? home : dir, '.claude', 'skills', 'hoq', 'SKILL.md'), text: skill }];
    case 'codex': return [{ kind: 'file', file: path.join(scope === 'user' ? home : dir, '.agents', 'skills', 'hoq', 'SKILL.md'), text: skill }];
    case 'cursor': return scope === 'user' ? [{ kind: 'skip', target, why: 'Cursor keeps user rules in its settings; run without --user inside the project' }]
      : [{ kind: 'file', file: path.join(dir, '.cursor', 'rules', 'hoq.mdc'), text: '---\ndescription: Build and read a House of Quality (QFD) through the hoq MCP server; needs, characteristics, 9/3/1 room, roof, gates, proposals a person confirms\nalwaysApply: false\n---\n' + body }];
    case 'copilot': return scope === 'user' ? [{ kind: 'skip', target, why: 'Copilot instruction files are per repository; run without --user inside the project' }]
      : [{ kind: 'file', file: path.join(dir, '.github', 'instructions', 'hoq.instructions.md'), text: '---\napplyTo: "**"\n---\n' + body }];
    case 'gemini': return [{ kind: 'section', file: path.join(scope === 'user' ? path.join(home, '.gemini') : dir, 'GEMINI.md'), text: body }];
    case 'agents-md': return scope === 'user' ? [{ kind: 'skip', target, why: 'AGENTS.md is per repository; run without --user inside the project' }]
      : [{ kind: 'section', file: path.join(dir, 'AGENTS.md'), text: body }];
    default: throw new Error('unknown target ' + target + ' (use ' + TARGETS.join(', ') + ' or all)');
  }
}
const sectionText = body => MARK0 + '\n' + body.trim() + '\n' + MARK1 + '\n';
function readManifest(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { version: 1, entries: [] }; } }
function writeManifest(p, m) { if (m.entries.length) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); else if (fs.existsSync(p)) fs.unlinkSync(p); }
function currentSection(file) { if (!fs.existsSync(file)) return null; const cur = fs.readFileSync(file, 'utf8'); const i = cur.indexOf(MARK0), j = cur.indexOf(MARK1); return i >= 0 && j > i ? cur.slice(i, j + MARK1.length) + '\n' : null; }

/** opts: {targets:[...]|'all', dir, scope:'project'|'user', force, dryRun, skill (text), log (fn)} → {written, skipped, kept} */
function install(opts) {
  const log = opts.log || (() => {});
  const dir = path.resolve(opts.dir || '.');
  const scope = opts.scope === 'user' ? 'user' : 'project';
  const targets = opts.targets === 'all' || !opts.targets ? TARGETS : opts.targets;
  const manifestPath = scope === 'user' ? path.join(os.homedir(), '.hoq-skills.json') : path.join(dir, '.hoq-skills.json');
  const manifest = readManifest(manifestPath);
  const result = { written: [], skipped: [], kept: [], manifest: manifestPath };
  targets.forEach(t => plan(t, opts.skill, dir, scope).forEach(p => {
    if (p.kind === 'skip') { result.skipped.push({ target: t, why: p.why }); log('skipped ' + t + ': ' + p.why); return; }
    const prev = manifest.entries.find(e => e.file === p.file);
    if (p.kind === 'file') {
      const onDisk = fs.existsSync(p.file) ? fs.readFileSync(p.file, 'utf8') : null;
      if (onDisk !== null && onDisk !== p.text && !opts.force) {
        const edited = prev ? sha(onDisk) !== prev.hash : true;
        if (edited) { result.kept.push({ target: t, file: p.file, why: prev ? 'edited since it was installed' : 'exists and was not written by hoq' }); log('kept ' + p.file + ' (' + (prev ? 'edited since it was installed' : 'not written by hoq') + '; --force overwrites)'); return; }
      }
      if (onDisk === p.text) { log('up to date ' + p.file); } else if (!opts.dryRun) { fs.mkdirSync(path.dirname(p.file), { recursive: true }); fs.writeFileSync(p.file, p.text); log('wrote ' + p.file); } else log('would write ' + p.file);
      result.written.push({ target: t, file: p.file });
      if (!opts.dryRun) { manifest.entries = manifest.entries.filter(e => e.file !== p.file); manifest.entries.push({ target: t, kind: 'file', file: p.file, hash: sha(p.text) }); }
    } else {
      const sec = sectionText(p.text); const cur = currentSection(p.file);
      if (cur && cur !== sec && prev && sha(cur) !== prev.hash && !opts.force) { result.kept.push({ target: t, file: p.file, why: 'the hoq section was edited since it was installed' }); log('kept the hoq section in ' + p.file + ' (edited; --force overwrites)'); return; }
      if (cur === sec) log('up to date ' + p.file);
      else if (!opts.dryRun) {
        let whole = fs.existsSync(p.file) ? fs.readFileSync(p.file, 'utf8') : '';
        const i = whole.indexOf(MARK0), j = whole.indexOf(MARK1);
        whole = i >= 0 && j > i ? whole.slice(0, i) + sec + whole.slice(j + MARK1.length).replace(/^\n/, '') : (whole ? whole.trimEnd() + '\n\n' : '') + sec;
        fs.mkdirSync(path.dirname(p.file), { recursive: true }); fs.writeFileSync(p.file, whole); log('wrote the hoq section in ' + p.file);
      } else log('would write the hoq section in ' + p.file);
      result.written.push({ target: t, file: p.file, section: true });
      if (!opts.dryRun) { manifest.entries = manifest.entries.filter(e => e.file !== p.file); manifest.entries.push({ target: t, kind: 'section', file: p.file, hash: sha(sec) }); }
    }
  }));
  if (!opts.dryRun) writeManifest(manifestPath, manifest);
  return result;
}

/** Remove what install wrote, and only that: a file or section changed since is left in place and reported. */
function uninstall(opts) {
  const log = opts.log || (() => {});
  const dir = path.resolve(opts.dir || '.');
  const scope = opts.scope === 'user' ? 'user' : 'project';
  const manifestPath = scope === 'user' ? path.join(os.homedir(), '.hoq-skills.json') : path.join(dir, '.hoq-skills.json');
  const manifest = readManifest(manifestPath);
  const result = { removed: [], kept: [], manifest: manifestPath };
  const remaining = [];
  manifest.entries.forEach(e => {
    if (e.kind === 'file') {
      if (!fs.existsSync(e.file)) { log('already gone ' + e.file); return; }
      const cur = fs.readFileSync(e.file, 'utf8');
      if (sha(cur) !== e.hash && !opts.force) { result.kept.push({ file: e.file, why: 'edited since it was installed' }); remaining.push(e); log('kept ' + e.file + ' (edited; --force removes)'); return; }
      if (!opts.dryRun) { fs.unlinkSync(e.file); let d = path.dirname(e.file); while (d !== dir && d !== os.homedir() && fs.existsSync(d) && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); d = path.dirname(d); } }
      result.removed.push(e.file); log((opts.dryRun ? 'would remove ' : 'removed ') + e.file);
    } else {
      const cur = currentSection(e.file);
      if (cur === null) { log('no hoq section left in ' + e.file); return; }
      if (sha(cur) !== e.hash && !opts.force) { result.kept.push({ file: e.file, why: 'the hoq section was edited since it was installed' }); remaining.push(e); log('kept the hoq section in ' + e.file + ' (edited; --force removes)'); return; }
      if (!opts.dryRun) { const whole = fs.readFileSync(e.file, 'utf8'); const rest = whole.replace(cur, '').replace(/\n{3,}/g, '\n\n'); if (rest.trim()) fs.writeFileSync(e.file, rest); else fs.unlinkSync(e.file); }
      result.removed.push(e.file + ' (section)'); log((opts.dryRun ? 'would remove' : 'removed') + ' the hoq section from ' + e.file);
    }
  });
  if (!opts.dryRun) { manifest.entries = remaining; writeManifest(manifestPath, manifest); }
  return result;
}

/** What is installed, and whether each piece still matches what was written. */
function list(opts) {
  const dir = path.resolve(opts.dir || '.');
  const scope = opts.scope === 'user' ? 'user' : 'project';
  const manifestPath = scope === 'user' ? path.join(os.homedir(), '.hoq-skills.json') : path.join(dir, '.hoq-skills.json');
  const manifest = readManifest(manifestPath);
  return { manifest: manifestPath, entries: manifest.entries.map(e => { const cur = e.kind === 'file' ? (fs.existsSync(e.file) ? fs.readFileSync(e.file, 'utf8') : null) : currentSection(e.file); return Object.assign({}, e, { state: cur === null ? 'missing' : sha(cur) === e.hash ? 'intact' : 'edited' }); }) };
}

module.exports = { TARGETS, install, uninstall, list, plan, MARK0, MARK1 };
