// rotation-scaffold.js — build a per-spec rotation SKELETON from the registry.
//
// Splits each spec's active abilities into generators / spenders / maintain /
// cooldowns / procs using RELIABLE signals from the tooltips ("Generates N X",
// "Consumes N X", cooldown length, proc flags). It does NOT decide priority or
// ST-vs-AoE — those go in st/aoe/summary, left blank for a human/LLM inference
// pass. Output: registry/rotations/<slug>.json  (confidence:"draft").
//
// Baseline (grimoire) spells have no desc in the repo; we fetch their tooltip
// from db.ascension.gg once and cache to coa-classes/<slug>/<slug>-baseline-tips.json.
//
//   node tools/rotation-scaffold.js <slug>        # one class
//   node tools/rotation-scaffold.js all           # every class in registry/INDEX.json

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const REG = path.join(ROOT, 'registry');
const COA = path.join(__dirname, 'coa-classes');
const OUT = path.join(REG, 'rotations');

function get(u) {
  return new Promise((res, rej) => {
    https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// strip aowow tooltip HTML -> plain text
function stripTip(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\\"/g, '"').replace(/\\\//g, '/')
    .replace(/\s+/g, ' ').trim();
}

async function baselineTips(slug, ids) {
  const cacheFile = path.join(COA, slug, slug + '-baseline-tips.json');
  let cache = {};
  if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  let fetched = 0;
  for (const id of ids) {
    if (cache[id] != null) continue;
    try {
      const html = await get(`https://db.ascension.gg/?spell=${id}`);
      const m = html.match(new RegExp('_\\[' + id + '\\]\\.tooltip_enus = "([\\s\\S]*?)";'));
      cache[id] = m ? stripTip(m[1]) : '';
      fetched++;
      await sleep(120);
    } catch { cache[id] = ''; }
  }
  if (fetched) fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  return cache;
}

// --- reliable classifiers over a tooltip/desc string ---
// tooltips concat lines with no space ("Consumes 2 FelfuryCharge..."), so
// capture a SINGLE capitalised word — it stops at the next camelCase boundary.
const reGen = /Generates?\s+(\d+)\s+([A-Z][a-z']+)/;              // numbered point-resource gen
const reSpend = /Consumes?\s+(\d+)\s+([A-Z][a-z']+)/;             // numbered point-resource spend
const reSpendUn = /Consumes?\s+(?:your\s+|all\s+(?:your\s+)?)?([A-Z][a-z']+(?:\s+[A-Z][a-z']+)?)/; // "Consumes Reaped Souls"
const reForEach = /for each\s+([A-Za-z' ]+?)\s+(?:active|you)/i;  // "for each Reaped Soul active"
// resource cost from the details.Cost field ("50 Energy", "30 Energy, plus 30 per sec")
function costOf(det) {
  if (!det || !det.Cost || det.Cost === 'None') return null;
  let m = det.Cost.match(/(\d+)\s+([A-Z][a-z]+)/);                                 // "50 Energy"
  if (m) return { res: m[2], amt: +m[1] };
  m = det.Cost.match(/(\d+)%\s+of\s+(?:base\s+|maximum\s+)?([A-Za-z]+)/i);          // "15% of base mana"
  if (m) return { res: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(), amt: +m[1] };
  return null;
}
const reLasts = /Lasts?\s+(?:for\s+)?(?:up to\s+)?([\d.]+)\s*(?:sec|min)/i;

function cdSeconds(det) {
  if (!det || !det.Cooldown || det.Cooldown === 'n/a') return 0;
  const m = det.Cooldown.match(/([\d.]+)\s*(sec|min|minute|hour)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return /min/i.test(m[2]) ? n * 60 : /hour/i.test(m[2]) ? n * 3600 : n;
}

function classify(a, text) {
  const gen = text.match(reGen);                                  // strong: numbered gen
  const spend = text.match(reSpend);                              // strong: numbered spend
  const cost = costOf(a.details);                                 // Energy/Mana/Rage cost
  const spendUn = !spend && !gen && (text.match(reForEach) || (/Consumes?\s/.test(text) && text.match(reSpendUn)));
  const cd = cdSeconds(a.details);
  const rotational = /rotational|movement/i.test(a.primary || '');
  const isProc = a.grantsProc || /\bproc/i.test(text);
  const isMaintain = (a.grantsBuff || a.primary === 'Buff') && reLasts.test(text)
    && !/defensif|defensive|reducing .* damage taken|immune/i.test(text);
  // priority: numbered point-resource > unnumbered consume > defensive/offensive CD
  //           > cost-based rotational spender > maintain > proc > filler
  const bucket =
    spend ? 'spenders' :
    gen ? 'generators' :
    spendUn ? 'spenders' :
    /defensif/i.test(a.primary || '') ? 'defensives' :
    /offensif/i.test(a.primary || '') || cd >= 60 ? 'cooldowns' :
    (cost && rotational) ? 'spenders' :
    isMaintain ? 'maintain' :
    isProc ? 'procs' : 'fillers';
  const res = (spend && spend[2].trim()) || (gen && gen[2].trim())
    || (spendUn && (spendUn[1] || '').trim()) || (bucket === 'spenders' && cost && cost.res) || undefined;
  return {
    id: a.spellId, name: a.name, primary: a.primary || '', cd: cd || undefined,
    resource: res,
    amount: (spend && +spend[1]) || (gen && +gen[1]) || (bucket === 'spenders' && !spend && !spendUn && cost && cost.amt) || undefined,
    proc: isProc || undefined, bucket,
    costRes: cost && cost.res || undefined,  // resource this ability costs, whatever its bucket
    note: text.slice(0, 140),
  };
}

async function buildClass(slug) {
  const reg = JSON.parse(fs.readFileSync(path.join(REG, slug + '.json'), 'utf8'));
  const baseFile = path.join(COA, slug, slug + '-baselines.json');
  const baselines = fs.existsSync(baseFile)
    ? JSON.parse(fs.readFileSync(baseFile, 'utf8')).abilities : [];
  const baseIds = baselines.filter(b => !b.inTree).map(b => b.baseSpellId);
  const tips = await baselineTips(slug, baseIds);

  // pools: class-tree active + baseline active are shared by every spec
  const active = reg.abilities.filter(a => !a.passive);
  const classPool = active.filter(a => a.source === 'class')
    .map(a => classify(a, (a.desc || '').replace(/\s+/g, ' ')));
  const basePool = baselines.filter(b => !b.inTree).map(b => {
    const text = tips[b.baseSpellId] || '';
    return classify(
      { spellId: b.baseSpellId, name: b.name, primary: '', grantsProc: false,
        grantsBuff: false, details: null }, text);
  }).filter(x => x.note); // drop baselines we couldn't fetch

  // merge-preserve: keep human-authored inference fields across reruns
  const outFile = path.join(OUT, slug + '.json');
  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { specs: {} };
  const rot = { slug, class: reg.class, generatedFrom: 'rotation-scaffold.js',
    confidence: 'draft', specs: {} };
  for (const s of reg.specs) {
    const specPool = active.filter(a => a.source === s.name)
      .map(a => classify(a, (a.desc || '').replace(/\s+/g, ' ')));
    const all = [...specPool, ...classPool, ...basePool];
    const by = k => all.filter(x => x.bucket === k)
      .map(x => ({ id: x.id, name: x.name, ...(x.resource ? { res: x.resource, amt: x.amount } : {}),
        ...(x.cd ? { cd: x.cd } : {}), ...(x.proc ? { proc: true } : {}) }));
    const p = prev.specs[s.name] || {};
    rot.specs[s.name] = {
      confidence: p.confidence && p.confidence !== 'draft' ? p.confidence : 'draft',
      resource: [...new Set(all.flatMap(x => [x.resource, x.costRes]).filter(Boolean))],
      generators: by('generators'),
      spenders: by('spenders'),
      maintain: p.maintain && p.maintain.length ? p.maintain : by('maintain'),
      cooldowns: by('cooldowns'),
      defensives: by('defensives'),
      procs: p.procs && p.procs.length ? p.procs : by('procs'),
      st: p.st || '',       // inference pass (preserved on rerun)
      aoe: p.aoe || '',     // inference pass
      summary: p.summary || '', // inference pass
    };
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(rot, null, 2));
  console.log(`wrote registry/rotations/${slug}.json  (${reg.specs.length} specs, ${basePool.length} baselines)`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: rotation-scaffold.js <slug>|all'); process.exit(1); }
  const slugs = arg === 'all'
    ? JSON.parse(fs.readFileSync(path.join(REG, 'INDEX.json'), 'utf8')).classes.map(c => c.slug)
    : [arg];
  for (const s of slugs) await buildClass(s);
}
main().catch(e => { console.error(e); process.exit(1); });
