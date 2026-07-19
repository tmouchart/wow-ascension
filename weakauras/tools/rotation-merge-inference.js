// Fold agent-written inference overlays into the rotation JSONs.
// Each agent writes registry/rotations/<slug>.inference.json with ONLY the
// judgment fields; this script injects them into registry/rotations/<slug>.json
// (preserving the deterministic generators/spenders/cooldowns arrays) and
// validates that spec names line up. Deletes the overlay once merged.
//
//   node tools/rotation-merge-inference.js         # merge every *.inference.json
//   node tools/rotation-merge-inference.js <slug>  # one class

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'registry', 'rotations');
const FIELDS = ['confidence', 'maintain', 'procs', 'st', 'aoe', 'summary'];

function merge(slug) {
  const overlayFile = path.join(DIR, slug + '.inference.json');
  const baseFile = path.join(DIR, slug + '.json');
  if (!fs.existsSync(overlayFile)) return { slug, ok: false, err: 'no overlay' };
  if (!fs.existsSync(baseFile)) return { slug, ok: false, err: 'no base rotation json' };
  const overlay = JSON.parse(fs.readFileSync(overlayFile, 'utf8'));
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  const problems = [];
  let filled = 0;
  for (const [name, inf] of Object.entries(overlay.specs || {})) {
    if (!base.specs[name]) { problems.push('unknown spec "' + name + '"'); continue; }
    for (const f of FIELDS) if (inf[f] != null) base.specs[name][f] = inf[f];
    filled++;
  }
  // any spec the agent skipped?
  for (const name of Object.keys(base.specs))
    if (!overlay.specs || !overlay.specs[name]) problems.push('spec "' + name + '" not filled');
  base.confidence = 'reviewed';
  fs.writeFileSync(baseFile, JSON.stringify(base, null, 2));
  fs.unlinkSync(overlayFile);
  return { slug, ok: problems.length === 0, filled, specs: Object.keys(base.specs).length, problems };
}

const arg = process.argv[2];
const slugs = arg ? [arg]
  : fs.readdirSync(DIR).filter(f => f.endsWith('.inference.json')).map(f => f.replace('.inference.json', ''));
if (!slugs.length) { console.log('no *.inference.json overlays found'); process.exit(0); }
let bad = 0;
for (const s of slugs) {
  const r = merge(s);
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'OK ' : 'XX '} ${r.slug}: ${r.filled || 0}/${r.specs || '?'} specs${r.problems && r.problems.length ? ' — ' + r.problems.join('; ') : ''}${r.err ? ' — ' + r.err : ''}`);
}
console.log(`\n${slugs.length - bad}/${slugs.length} merged clean`);
