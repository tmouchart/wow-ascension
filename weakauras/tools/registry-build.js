// M2 — normalize the scraped talent-tree + baseline data into a per-class registry.json the webapp
// palette consumes. One entry per castable spell: { spellId, name, icon, iconUrl, source, guessActive, desc }.
//
// icon -> db.ascension.gg URL (blocker B resolved: that CDN hosts 100% of icons incl. custom).
// guessActive: isPassive from the scrape is unreliable (marks everything "A"), so we heuristically flag
//   castable-active vs passive from the description. This is a BEST GUESS — the palette should default to
//   active, let the user toggle "show all". Accuracy is reported by the script (not shipped blind).
//
//   node tools/registry-build.js [slug...|all]   ->  writes registry/<slug>.json + registry/INDEX.json
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'coa-classes');
const OUT = path.join(__dirname, '..', 'registry');

function iconUrl(icon) {
  if (!icon) return null;
  const n = icon.replace(/^Interface\\+Icons\\+/i, '').replace(/\\/g, '').toLowerCase().trim();
  return 'https://db.ascension.gg/static/images/wow/icons/medium/' + encodeURIComponent(n) + '.jpg';
}

// Passive if the description opens with a stat/trigger-modifier phrase, or is a triggered ("... now ...")
// modifier. Otherwise treated as an active castable button. Heuristic only — accuracy reported below.
const PASSIVE_START = /^(increases|reduces|decreases|your |each |every |when |while |casting |using |direct |dealing |gain|grants|grant |after |whenever|allows|lowers|raises|landing|generating)/i;
// "X now Y" is the near-universal phrasing of a talent modifier (passive); plus stat/cooldown-modifier hints.
const PASSIVE_HINT = /\bnow\b|\b(chance to|cooldown of|cost of|effectiveness of|duration of)\b/i;
function guessActive(desc) {
  const d = (desc || '').trim();
  if (!d) return true;                 // no desc (e.g. baseline) -> assume castable
  if (PASSIVE_START.test(d)) return false;
  if (PASSIVE_HINT.test(d)) return false;
  return true;
}

function buildClass(slug) {
  const nodesPath = path.join(ROOT, slug, slug + '-nodes.json');
  if (!fs.existsSync(nodesPath)) return null;
  const nj = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
  const tabToSpec = {};
  for (const [name, tab] of Object.entries(nj.specToTab || {})) tabToSpec[tab] = name;

  const byId = new Map();
  const push = (a) => {
    const e = byId.get(a.spellId);
    if (e) { if (!e.sources.includes(a.source)) e.sources.push(a.source); return; }
    byId.set(a.spellId, { ...a, sources: [a.source] });
  };
  for (const n of nj.nodes) {
    const source = n.tabId === nj.classTreeTab ? 'class' : (tabToSpec[n.tabId] || ('tab' + n.tabId));
    push({
      spellId: n.spellId, name: n.name, icon: n.icon, iconUrl: iconUrl(n.icon),
      source, entryType: n.entryType, guessActive: guessActive(n.desc), desc: n.desc || '',
      level: n.requiredLevel || 0, essence: n.aeCost || n.teCost || 0, maxPoints: n.maxPoints || 1,
      altSpellIds: (n.spellIds || []).filter(x => x !== n.spellId),
    });
  }
  const basePath = path.join(ROOT, slug, slug + '-baselines.json');
  if (fs.existsSync(basePath)) {
    const bj = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    for (const a of (bj.abilities || [])) {
      push({
        spellId: a.baseSpellId, name: a.name, icon: a.icon, iconUrl: iconUrl(a.icon),
        source: 'baseline', entryType: 'Baseline', guessActive: true, desc: '',
        level: (a.ranks && a.ranks[0] && a.ranks[0].level) || 0, essence: 0, maxPoints: 1,
        altSpellIds: [],
      });
    }
  }
  const abilities = [...byId.values()];
  mergeDetails(slug, abilities);   // scraped spell-detail fields (cooldown/school/cost/...)
  mergeTags(slug, abilities);      // durable classification sidecar (primary category + tags)
  const specs = Object.entries(nj.specToTab || {}).map(([name, tabId]) => ({ name, tabId }));
  return { slug, class: nj.class, classId: nj.classId, classTreeTab: nj.classTreeTab, specs,
    abilityCount: abilities.length, abilities };
}

// Merge registry/<slug>.tags.json (authored classification) into each ability. Durable across re-scrapes.
function mergeTags(slug, abilities) {
  const p = path.join(OUT, slug + '.tags.json');
  if (!fs.existsSync(p)) return;
  const t = JSON.parse(fs.readFileSync(p, 'utf8')).spells || {};
  for (const a of abilities) {
    const e = t[a.spellId];
    if (!e) continue;
    a.primary = e.primary; a.tags = e.tags || []; a.passive = !!e.passive;
    a.grantsProc = !!e.grantsProc; a.grantsBuff = !!e.grantsBuff;
    if (e.confidence) a.confidence = e.confidence;
  }
}

// Merge tools/coa-classes/<slug>/<slug>-spell-details.json (scraped fields) into each ability.
function mergeDetails(slug, abilities) {
  const p = path.join(ROOT, slug, slug + '-spell-details.json');
  if (!fs.existsSync(p)) return;
  const spells = (JSON.parse(fs.readFileSync(p, 'utf8')).spells) || {};
  for (const a of abilities) {
    const e = spells[a.spellId];
    if (e && e.ok && e.details) a.details = e.details;
  }
}

// ---- run ----
const arg = process.argv.slice(2);
const slugs = (!arg.length || arg[0] === 'all')
  ? fs.readdirSync(ROOT).filter(d => fs.statSync(path.join(ROOT, d)).isDirectory())
  : arg;

fs.mkdirSync(OUT, { recursive: true });
const index = [];
let totAb = 0, totActive = 0;
for (const slug of slugs) {
  const reg = buildClass(slug);
  if (!reg) { console.log(`  ! ${slug}: no nodes.json, skipped`); continue; }
  fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify(reg, null, 1));
  const active = reg.abilities.filter(a => a.guessActive).length;
  totAb += reg.abilityCount; totActive += active;
  index.push({ slug, class: reg.class, classId: reg.classId, specs: reg.specs.map(s => s.name),
    abilityCount: reg.abilityCount, guessActive: active });
  console.log(`  ${reg.class.padEnd(18)} ${String(reg.abilityCount).padStart(3)} abilities  |  ${String(active).padStart(3)} guess-active (${(100 * active / reg.abilityCount).toFixed(0)}%)`);
}
fs.writeFileSync(path.join(OUT, 'INDEX.json'), JSON.stringify({ classes: index }, null, 1));
console.log(`\n${index.length} classes -> registry/  |  ${totAb} abilities total, ${totActive} guess-active (${(100 * totActive / totAb).toFixed(0)}%)`);
