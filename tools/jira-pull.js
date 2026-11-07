#!/usr/bin/env node
/* jira-pull.js — refresh the work items of a house from Jira Cloud through the REST API (node 18+, no dependencies).
 *
 *   JIRA_SITE=your-site.atlassian.net JIRA_EMAIL=you@example.com JIRA_API_TOKEN=… \
 *   node tools/jira-pull.js --house house.json [--jql "…"] [--points-field customfield_10016] [--sprint-field customfield_10020] [--add-all] [--write]
 *
 * Reads every issue the JQL returns (default: the projects of the keys the house names, `project in (MUG) ORDER BY key`), maps each
 * onto the column names of Jira's CSV export (Issue key, Summary, Status, Due date, Updated, Resolved, Priority, Sprint, Custom field
 * (Story point estimate)) and merges them with HOQ.importItems, exactly as a dropped CSV would: statuses, due dates, points, updated,
 * resolved, priority and sprint come from Jira; tested, retested and note stay yours. By default only keys the house links are touched;
 * --add-all adds every issue the JQL returns (pair it with a narrow --jql). Without --write it prints the diff and writes nothing.
 * With --write it saves the house and appends {ts, actor:'jira-pull', op:'items.import', summary, revision} to <house>.log.jsonl.
 *
 * The token is read from the environment, sent as Basic auth, and never printed or written anywhere. Make one with
 * https://id.atlassian.com/manage-profile/security/api-tokens. The page never sees these credentials: it reads the saved house.json.
 * Requests go to https://api.atlassian.com/ex/jira/<cloudId> (the cloudId comes from https://<site>/_edge/tenant_info, no auth, or
 * JIRA_CLOUD_ID): a scoped token works only there, and the site hostname treats a rejected pair as anonymous (200, no issues), so
 * /myself is checked first and the script stops if the pair is not accepted.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', 'web', 'hoq-core.js'));

const args = process.argv.slice(2);
const val = (flag, dflt) => { const i = args.indexOf(flag); if (i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) return args[i + 1]; const f = args.find(x => x.startsWith(flag + '=')); return f ? f.slice(flag.length + 1) : dflt; };
const houseFile = val('--house', '');
if (!houseFile || args.includes('--help')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 14).join('\n').replace(/^ \*\s?/gm, '')); process.exit(houseFile ? 0 : 1); }
const SITE = (process.env.JIRA_SITE || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const EMAIL = process.env.JIRA_EMAIL || '';
const TOKEN = process.env.JIRA_API_TOKEN || '';
const missing = [['JIRA_SITE', SITE], ['JIRA_EMAIL', EMAIL], ['JIRA_API_TOKEN', TOKEN]].filter(x => !x[1]).map(x => x[0]);
if (missing.length) { console.error('jira-pull: set ' + missing.join(', ') + ' in the environment (the token is never printed).'); process.exit(1); }
const POINTS = val('--points-field', 'customfield_10016');
const SPRINT = val('--sprint-field', 'customfield_10020');
const WRITE = args.includes('--write');
const ADD = args.includes('--add-all') ? 'all' : 'linked';

const raw = JSON.parse(fs.readFileSync(houseFile, 'utf8'));
const { house, errors } = H.normalize(raw);
if (errors.length) { console.error('The house has errors:\n  ' + errors.join('\n  ')); process.exit(2); }
const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const keys = new Set(Object.keys(house.items).filter(k => KEY_RE.test(k)));
[...house.characteristics, ...house.needs].forEach(x => H.linksOf(x.links, house.items).forEach(k => { if (KEY_RE.test(k)) keys.add(k); }));
const projects = [...new Set([...keys].map(k => k.split('-')[0]))].sort();
let jql = val('--jql', '');
if (!jql) {
  if (!projects.length) { console.error('jira-pull: the house names no Jira keys (links or items such as MUG-3); give --jql.'); process.exit(1); }
  // `key in (…)` fails as a whole when one key no longer exists, so the default asks for the projects and lets importItems keep only what the house links.
  jql = `project in (${projects.join(', ')}) ORDER BY key ASC`;
}
const fields = ['summary', 'status', 'updated', 'duedate', 'priority', 'resolutiondate'].concat(POINTS ? [POINTS] : [], SPRINT ? [SPRINT] : []);
const HEADERS = { Authorization: 'Basic ' + Buffer.from(EMAIL + ':' + TOKEN).toString('base64'), Accept: 'application/json', 'Content-Type': 'application/json' };
let BASE = '';
// Resolve the site's cloudId and check that Jira accepts the pair before reading anything.
async function connect() {
  let cloudId = process.env.JIRA_CLOUD_ID || '';
  if (!cloudId) {
    const r = await fetch(`https://${SITE}/_edge/tenant_info`);
    if (!r.ok) throw new Error(`https://${SITE}/_edge/tenant_info answered ${r.status}: is JIRA_SITE the site's hostname?`);
    cloudId = ((await r.json()) || {}).cloudId || '';
    if (!cloudId) throw new Error(`no cloudId in https://${SITE}/_edge/tenant_info`);
  }
  BASE = `https://api.atlassian.com/ex/jira/${cloudId}`;
  const me = await fetch(`${BASE}/rest/api/3/myself`, { headers: HEADERS });
  if (me.status === 401 || me.status === 403) throw new Error(`Jira did not accept the JIRA_EMAIL + JIRA_API_TOKEN pair (${me.status}): the email must be the one on the Atlassian account that made the token, the token pasted whole, and a scoped token needs read:jira-work.`);
  if (!me.ok) throw new Error(`Jira answered ${me.status} on /myself`);
  const who = await me.json();
  return who.displayName || who.accountId || 'account';
}

async function search(jqlText) {
  const out = []; let nextPageToken; let pages = 0;
  for (;;) {
    const body = { jql: jqlText, maxResults: 100, fields }; if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetch(`${BASE}/rest/api/3/search/jql`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!res.ok) { const err = new Error(`Jira answered ${res.status}: ${(json.errorMessages || []).join(' ') || text.slice(0, 300)}`); err.status = res.status; err.messages = json.errorMessages || []; throw err; }
    (json.issues || []).forEach(i => out.push(i)); pages++;
    if (!json.nextPageToken || json.isLast) break; nextPageToken = json.nextPageToken;
  }
  return { issues: out, pages };
}
const sprintName = v => { if (!v) return ''; const last = Array.isArray(v) ? v[v.length - 1] : v; return typeof last === 'string' ? (last.match(/name=([^,\]]+)/) || [])[1] || last : (last && last.name) || ''; };
const toRow = issue => { const f = issue.fields || {}; const row = { issue_key: issue.key, summary: f.summary || '', status: (f.status && f.status.name) || '', due_date: f.duedate || '', updated: f.updated || '', resolved: f.resolutiondate || '', priority: (f.priority && f.priority.name) || '' };
  if (POINTS) row['custom_field_(story_point_estimate)'] = f[POINTS] === undefined || f[POINTS] === null ? '' : String(f[POINTS]);
  if (SPRINT) row.sprint = sprintName(f[SPRINT]);
  return row; };

(async () => {
  const who = await connect();
  console.log(`Jira ${SITE} · as ${who} · ${jql}`);
  let got;
  try { got = await search(jql); }
  catch (e) {
    // A `key in (…)` list with one unknown key fails whole: drop the key Jira names and try once more.
    const bad = e.messages && e.messages.map(m => (m.match(/'([A-Z][A-Z0-9_]+-\d+)'/) || [])[1]).find(Boolean);
    if (e.status === 400 && bad && /key\s+in/i.test(jql)) { console.error(`Jira does not know ${bad}; retrying without it.`); jql = jql.replace(new RegExp('\\b' + bad + '\\b\\s*,?\\s*', ''), '').replace(/,\s*\)/, ')'); got = await search(jql); }
    else throw e;
  }
  const rows = got.issues.map(toRow);
  console.log(`${rows.length} issue${rows.length === 1 ? '' : 's'} read in ${got.pages} page${got.pages === 1 ? '' : 's'} · the house names ${keys.size} key${keys.size === 1 ? '' : 's'}`);
  const readAt = new Date().toISOString();
  const r = H.importItems(house, rows, { mapping: 'jira', add: ADD, source: 'Jira ' + SITE, readAt });
  console.log(H.importText(r).join('\n'));
  const notSeen = [...keys].filter(k => !rows.some(x => x.issue_key === k));
  if (notSeen.length) console.log(`  not in the answer (deleted, moved, or outside the JQL): ${notSeen.join(', ')}`);
  if (!WRITE) { console.log('Dry run: nothing written. Add --write to update ' + houseFile + '.'); return; }
  const n = H.normalize(house); if (n.errors.length) { console.error('Errors:\n  ' + n.errors.join('\n  ')); process.exit(2); }
  n.house.revision = (n.house.revision || 0) + 1;
  fs.writeFileSync(houseFile, JSON.stringify(n.house, null, 2));
  const line = { ts: readAt, actor: 'jira-pull', op: 'items.import', summary: `Statuses merged from Jira ${SITE}: ${r.changes.length} change${r.changes.length === 1 ? '' : 's'}, ${r.added.length} added, ${r.unchanged.length} unchanged, ${r.skipped.length} skipped.`, revision: n.house.revision, source: 'Jira ' + SITE, readAt, changes: r.changes, added: r.added.map(a => a.key) };
  try { fs.appendFileSync(houseFile.replace(/\.json$/i, '') + '.log.jsonl', JSON.stringify(line) + '\n'); } catch (e) { /* the log is best effort */ }
  console.log('wrote', houseFile, '· revision', n.house.revision, '· board read', readAt);
  if (n.warnings.length) console.log('Warnings:\n  ' + n.warnings.join('\n  '));
})().catch(e => { console.error('jira-pull: ' + e.message); process.exit(1); });
