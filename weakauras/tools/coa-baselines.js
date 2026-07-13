// Scrape each CoA class's BASELINE / grimoire spells (the ones learned on level-up,
// NOT in the talent trees) from the Ascension spell DB (db.ascension.gg = an aowow instance).
//
// The blind spot this fixes: the CoA talent-builder scrape only yields talent-TREE nodes.
// Baseline abilities (Twin Slice, Chaos Rush, Fel Fireball, ...) are learned from the class
// grimoire and never appear in the trees. The aowow DB indexes them under a per-class
// SKILL LINE (skill=489 -> "Felsworn", 488 -> "Stormbringer", ...). We enumerate that line,
// subtract the spellIds we already have from the trees, and what remains is the baseline set.
//
//   node coa-baselines.js discover           # scan skill ids, print title -> id map
//   node coa-baselines.js <slug> [slug...]   # build baselines for these classes
//   node coa-baselines.js all                # build for every scraped class folder
//
// Output per class in coa-classes/<slug>/:
//   <slug>-baselines.json  (full rows, grouped by ability with rank ladder)
//   <slug>-baselines.md    (readable table; BASELINE-only vs also-in-tree)

const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'db.ascension.gg';
const OUT = path.join(__dirname, 'coa-classes');
// Observed CoA class/spec skill-line block. Widen if a class isn't found.
const SCAN_RANGE = [470, 510];

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Custom Ascension spells are name-prefixed with '@'. This is the reliable CoA marker —
// the row-level `isCoaClass` flag is inconsistent (e.g. Runemaster's baselines have it 0).
const isCoa = r => typeof r.name === 'string' && r.name.startsWith('@');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

async function getRetry(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await get(url); }
    catch (e) { err = e; await sleep(300 * (i + 1)); }
  }
  throw err;
}

// aowow renders listings as `new Listview({..."data":[ ... ]...})`. Pull that JSON array.
function listviewData(html) {
  const i = html.indexOf('"data":[');
  if (i < 0) return [];
  const start = html.indexOf('[', i);
  let depth = 0;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (c === '[') depth++;
    else if (c === ']') { if (--depth === 0) { try { return JSON.parse(html.slice(start, j + 1)); } catch { return []; } } }
  }
  return [];
}

function pageTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].split(' - ')[0].trim() : '';
}

// Scan the skill-id block, return { "<title>": id } for lines that carry CoA spells.
async function discover() {
  const map = {};
  for (let id = SCAN_RANGE[0]; id <= SCAN_RANGE[1]; id++) {
    let html;
    try { html = await getRetry(`https://${HOST}/?skill=${id}`); } catch { continue; }
    const rows = listviewData(html);
    const coa = rows.filter(isCoa).length;
    if (rows.length && coa) map[pageTitle(html)] = id;
    await sleep(80);
  }
  return map;
}

// Collect every castable spellId already known from a class's talent-tree scrape.
function treeSpellIds(slugName) {
  const f = path.join(OUT, slugName, `${slugName}-nodes.json`);
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ids = new Set();
  const walk = o => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if (k === 'spellId' && Number.isInteger(v)) ids.add(v);
      else if (k === 'spellIds' && Array.isArray(v)) v.forEach(x => Number.isInteger(x) && ids.add(x));
      else walk(v);
    }
  };
  walk(data.nodes || data);
  return { ids, meta: data };
}

async function fetchLine(id) {
  const html = await getRetry(`https://${HOST}/?skill=${id}`);
  return listviewData(html);
}

// Group rank rows under a base ability name; base = lowest required level.
function groupByAbility(rows, treeIds) {
  const g = {};
  for (const r of rows) {
    const name = (r.name || '').replace(/^@/, '');
    (g[name] = g[name] || []).push(r);
  }
  const out = [];
  for (const name of Object.keys(g).sort()) {
    const ranks = g[name].sort((a, b) => (a.level || 0) - (b.level || 0));
    const ids = ranks.map(r => r.id);
    const inTree = ids.some(x => treeIds.has(x));
    out.push({
      name,
      baseSpellId: ranks[0].id,          // lowest-level rank = the learn id
      icon: ranks[0].icon,
      inTree,                             // true => also a talent, not purely baseline
      ranks: ranks.map(r => ({ id: r.id, level: r.level, rank: r.rank || '', source: r.source })),
    });
  }
  return out;
}

async function buildClass(slugName, lineMap) {
  const { ids: treeIds, meta } = treeSpellIds(slugName);
  const display = meta.class;
  const specs = meta.specs || [];

  // class base line (title === class display name) + any spec-named lines
  const lineIds = [];
  if (lineMap[display]) lineIds.push({ title: display, id: lineMap[display] });
  for (const sp of specs) if (lineMap[sp]) lineIds.push({ title: sp, id: lineMap[sp] });

  if (!lineIds.length) {
    console.log(`  ${slugName}: no skill line found (display "${display}") - skipped`);
    return null;
  }

  const seen = new Set();
  const rows = [];
  for (const { title, id } of lineIds) {
    const data = await fetchLine(id);
    for (const r of data) if (isCoa(r) && !seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    await sleep(100);
  }

  const abilities = groupByAbility(rows, treeIds);
  const baseline = abilities.filter(a => !a.inTree);
  const overlap = abilities.filter(a => a.inTree);

  // JSON
  const dir = path.join(OUT, slugName);
  fs.writeFileSync(path.join(dir, `${slugName}-baselines.json`),
    JSON.stringify({ class: display, skillLines: lineIds, baselineCount: baseline.length,
      abilities }, null, 2));

  // Markdown
  const row = a => `| ${a.baseSpellId} | ${a.name} | ${a.ranks.length} | ${a.ranks.map(r => r.level).join(',')} | ${a.ranks.map(r => r.id).join(', ')} |`;
  const md = [
    `# ${display} — baseline / grimoire spells`,
    ``,
    `Source: db.ascension.gg (aowow) skill line(s) ${lineIds.map(l => `${l.title}=${l.id}`).join(', ')}.`,
    `These are learned on level-up (not in the talent trees). ${baseline.length} baseline abilities` +
      `${overlap.length ? `, ${overlap.length} also appear as talents` : ''}.`,
    ``,
    `## Baseline-only (${baseline.length}) — the talent-tree scrape misses these`,
    ``,
    `| base spellId | name | #ranks | levels | all rank ids |`,
    `|---|---|---|---|---|`,
    ...baseline.map(row),
  ];
  if (overlap.length) md.push(``, `## Also in talent tree (${overlap.length})`, ``,
    `| base spellId | name | #ranks | levels | all rank ids |`, `|---|---|---|---|---|`, ...overlap.map(row));
  md.push(``);
  fs.writeFileSync(path.join(dir, `${slugName}-baselines.md`), md.join('\n'));

  console.log(`  ${slugName}: ${baseline.length} baseline-only, ${overlap.length} overlap (lines: ${lineIds.map(l => l.id).join(',')})`);
  return { slug: slugName, display, baseline: baseline.length, overlap: overlap.length, lineIds };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('usage: node coa-baselines.js discover | all | <slug>...'); process.exit(1); }

  console.log('Discovering skill lines...');
  const lineMap = await discover();
  console.log(`  found ${Object.keys(lineMap).length} CoA skill lines`);

  if (args[0] === 'discover') {
    for (const [t, id] of Object.entries(lineMap).sort((a, b) => a[1] - b[1])) console.log(`  ${id}  ${t}`);
    return;
  }

  let slugs = args;
  if (args[0] === 'all') slugs = fs.readdirSync(OUT).filter(d =>
    fs.existsSync(path.join(OUT, d, `${d}-nodes.json`)));

  const summary = [];
  for (const s of slugs) {
    try { const r = await buildClass(s, lineMap); if (r) summary.push(r); }
    catch (e) { console.log(`  ${s}: ERROR ${e.message}`); }
  }
  console.log(`\nDone. ${summary.length} classes, ${summary.reduce((n, r) => n + r.baseline, 0)} baseline abilities total.`);
}

main().catch(e => { console.error(e); process.exit(1); });
