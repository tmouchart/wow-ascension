// M2 — resource model (blocker A). The scrape has NO power-type data, so we infer the RESOURCE NAMES from
// ability descriptions (which resource each class spends/generates) + detect point/stack resources.
//
// CRITICAL GOTCHA: the resource NAME does NOT give the WoW power INDEX. On this Ascension client, custom
// resources are exposed on whatever power slot the client wired them to, NOT the retail semantic — proven
// by Barbarian, whose "Rage" bar reads power INDEX 3 (Energy slot), not 1. So powerIndex must be CONFIRMED
// in-game per class (a UnitPower probe); we only hard-code the indices already validated for built classes.
//
//   node tools/resource-infer.js   ->  writes registry/resource-model.json (curation scaffold)
const fs = require('fs');
const path = require('path');

const REG = path.join(__dirname, '..', 'registry');

// power INDEX confirmed in-game (from classes/<name>/build.js). Everything else = null (needs a probe).
const CONFIRMED = {
  felsworn: { primary: { name: 'Energy', index: 3 }, points: [{ name: 'Felfury', kind: 'buffStacks' }] },
  barbarian: { primary: { name: 'Rage', index: 3 }, points: [] },
  runemaster: { primary: { name: 'Mana', index: 0 }, points: [{ name: 'Runeblade', kind: 'spellCharges' }] },
};

const POWER_WORDS = ['Energy', 'Mana', 'Rage', 'Focus', 'Runic Power'];
const GEN_RE = /(?:generat\w+|consum\w+|spend\w+|restor\w+|cost\w*)\s+(?:\d+\s+)?([A-Z][A-Za-z]+)/g;

function infer(reg) {
  const descs = reg.abilities.map(a => a.desc || '').filter(Boolean);
  const blob = descs.join('  ');
  // primary resource guess = most-mentioned standard power word
  const mentions = {};
  for (const w of POWER_WORDS) {
    const m = blob.match(new RegExp('\\b' + w.replace(' ', '\\s+') + '\\b', 'gi'));
    if (m) mentions[w] = m.length;
  }
  const primaryGuess = Object.entries(mentions).sort((a, b) => b[1] - a[1])[0];
  // point/stack resources = capitalized nouns following generate/consume/spend, minus the power words
  const pts = {};
  let m;
  while ((m = GEN_RE.exec(blob))) {
    const name = m[1];
    if (POWER_WORDS.some(w => w.startsWith(name)) || ['Health', 'The', 'A', 'An', 'Your'].includes(name)) continue;
    pts[name] = (pts[name] || 0) + 1;
  }
  const points = Object.entries(pts).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  return { mentions, primaryGuess: primaryGuess ? { name: primaryGuess[0], mentions: primaryGuess[1] } : null, points };
}

const index = JSON.parse(fs.readFileSync(path.join(REG, 'INDEX.json'), 'utf8'));
const out = {};
for (const { slug, class: cls } of index.classes) {
  const reg = JSON.parse(fs.readFileSync(path.join(REG, slug + '.json'), 'utf8'));
  const inf = infer(reg);
  const conf = CONFIRMED[slug];
  out[slug] = {
    class: cls,
    confirmed: !!conf,
    primary: conf ? conf.primary : { name: inf.primaryGuess ? inf.primaryGuess.name : null, index: null },
    points: conf ? conf.points : inf.points.map(p => ({ name: p.name, kind: 'buffStacks' })),
    _inferred: { powerMentions: inf.mentions, pointCandidates: inf.points },
  };
}
fs.mkdirSync(REG, { recursive: true });
fs.writeFileSync(path.join(REG, 'resource-model.json'), JSON.stringify(out, null, 1));

// report
console.log('class              confirmed  primary(idx)      point resources (inferred)');
for (const [slug, r] of Object.entries(out)) {
  const prim = `${r.primary.name || '?'}(${r.primary.index != null ? r.primary.index : '?'})`;
  const pts = r.points.map(p => p.name).join(', ') || '-';
  console.log(`  ${r.class.padEnd(17)} ${(r.confirmed ? 'YES' : 'no ').padEnd(9)} ${prim.padEnd(17)} ${pts}`);
}
console.log('\n-> registry/resource-model.json  (index=? and confirmed:no need an in-game UnitPower probe)');
