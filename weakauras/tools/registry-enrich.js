// Enrich a class registry with per-spell detail data scraped from db.ascension.gg (aowow).
// The talent-tree fiber scrape and the baselines listing never captured cooldown/cast/school/cost/etc.
// Those all live on the spell DETAIL page (?spell=<id>) inside the `#spelldetails` stat table.
//
// For every spellId in registry/<slug>.json we fetch the detail page and store THREE levels, so a later
// AI pass has the raw source and never misses a field:
//   details  - generic {label: value} parse of every th/td row (incl. Effect #N)  <- convenience
//   text     - the visible, tag-stripped text of the spell-details section          <- AI-friendly
//   rawHtml  - the raw HTML of the data-bearing block, scripts/comments removed      <- source of record
//
//   node tools/registry-enrich.js <slug>          -> writes tools/coa-classes/<slug>/<slug>-spell-details.json
//   node tools/registry-enrich.js <slug> --merge  -> also merges `details` back into registry/<slug>.json
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, 'coa-classes');
const REG = path.join(__dirname, '..', 'registry');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchPage(id) {
  const url = 'https://db.ascension.gg/?spell=' + id;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

const stripTags = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

// Pull the `#spelldetails` block out of the page. Returns raw HTML (scripts/comments removed) or null.
function extractDetailsBlock(html) {
  const start = html.indexOf('id="spelldetails"');
  if (start < 0) return null;
  // The details column ends before the related-spells Listview / comments section.
  let end = html.indexOf('new Listview', start);
  if (end < 0) end = html.indexOf('<div id="comments"', start);
  if (end < 0) end = start + 6000;
  let block = html.slice(start, end);
  block = block.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return block;
}

// Generic th/td parse -> {label: value}. Effect #N rows are collected into an `effects` array too.
function parseDetails(block) {
  const details = {};
  const effects = [];
  const rows = [...block.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)];
  for (const r of rows) {
    const k = stripTags(r[1]);
    const v = stripTags(r[2]);
    if (!k) continue;
    if (/^Effect #/i.test(k)) { effects.push(v); continue; }
    details[k] = v;
  }
  if (effects.length) details.Effects = effects;
  return details;
}

async function enrichClass(slug, merge) {
  const regPath = path.join(REG, slug + '.json');
  if (!fs.existsSync(regPath)) { console.error('no registry for', slug); return; }
  const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  const ids = reg.abilities.map(a => a.spellId);
  console.log(`${slug}: ${ids.length} spells to fetch`);

  const out = {};
  let ok = 0, empty = 0, failed = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let res = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      try { res = await fetchPage(id); }
      catch (e) { if (attempt === 1) { failed++; out[id] = { id, ok: false, error: e.message }; } else await sleep(600); }
    }
    if (!res) { process.stdout.write('x'); await sleep(150); continue; }
    const block = extractDetailsBlock(res.body);
    if (!block) { empty++; out[id] = { id, ok: false, http: res.status, note: 'no #spelldetails' }; process.stdout.write('.'); }
    else {
      const details = parseDetails(block);
      out[id] = { id, ok: true, http: res.status, details, text: stripTags(block), rawHtml: block.replace(/\s+/g, ' ').trim() };
      ok++; process.stdout.write(Object.keys(details).length ? '#' : 'o');
    }
    if ((i + 1) % 50 === 0) process.stdout.write(` ${i + 1}/${ids.length}\n`);
    await sleep(150);
  }
  process.stdout.write('\n');

  const dir = path.join(ROOT, slug);
  const outPath = path.join(dir, slug + '-spell-details.json');
  fs.writeFileSync(outPath, JSON.stringify({ slug, count: ids.length, ok, empty, failed, spells: out }, null, 1));
  console.log(`wrote ${outPath}  (ok:${ok} empty:${empty} failed:${failed})`);

  if (merge) {
    for (const a of reg.abilities) { const e = out[a.spellId]; if (e && e.ok) a.details = e.details; }
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 1));
    console.log(`merged details into ${regPath}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const merge = args.includes('--merge');
  const slugs = args.filter(a => !a.startsWith('--'));
  if (!slugs.length) { console.error('usage: node tools/registry-enrich.js <slug> [--merge]'); process.exit(1); }
  for (const s of slugs) await enrichClass(s, merge);
}

main().catch(e => { console.error(e); process.exit(1); });
