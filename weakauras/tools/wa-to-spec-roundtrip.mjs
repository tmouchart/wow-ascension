// Verify the WA -> SPEC decompiler (lib/wa-to-spec.js) against every class spec.json:
//   spec.json --specToParts--> parts --assembleTop--> top --waToSpec--> spec' --specToParts--> parts'
// and assert parts' regenerates the SAME regions (root group + flat children) as parts. If they match, the
// decompiled SPEC is faithful (it reproduces the exact package), even where it differs textually from the
// original spec.json (default fields made explicit). This is the round-trip gate for `import string`.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { specToParts } = require('../lib/spec-builder.js');
const B = require('../lib/builders-core.js');
const { waToSpec } = require('../lib/wa-to-spec.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const classesDir = join(root, 'classes');

// stable stringify (sort object keys) so key-order noise never fails the compare
const stable = (o) => JSON.stringify(o, (_k, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);

let fail = 0;
for (const slug of readdirSync(classesDir)) {
  const p = join(classesDir, slug, 'spec.json');
  let spec;
  try { spec = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }

  const parts = specToParts(spec);
  const top = B.assembleTop({ group: parts.group, children: parts.children, combatOnly: parts.combatOnly });

  let top2, err;
  try { top2 = B.assembleTop(specToParts(waToSpec(top))); }
  catch (e) { err = e; }

  if (err) { console.log(`FAIL ${slug}: ${err.message}`); fail++; continue; }

  // compare the fully-assembled envelopes (assembleTop applies combatOnly/use_combat, so this is the
  // honest end-to-end check — original `parts` were mutated in place when `top` was assembled above)
  if (stable(top) === stable(top2)) { console.log(`ok   ${slug}`); continue; }

  fail++;
  console.log(`FAIL ${slug}: regenerated regions differ`);
  // first differing region, to make the mismatch actionable
  const ca = top.c, cb = top2.c;
  if (ca.length !== cb.length) console.log(`  children count: ${ca.length} -> ${cb.length}`);
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    if (stable(ca[i]) !== stable(cb[i])) {
      console.log(`  first diff at child[${i}] id=${(ca[i] || {}).id} -> ${(cb[i] || {}).id}`);
      const da = stable(ca[i]), db = stable(cb[i]);
      let j = 0; while (j < da.length && da[j] === db[j]) j++;
      console.log(`    orig : ...${da.slice(Math.max(0, j - 40), j + 80)}`);
      console.log(`    round: ...${db.slice(Math.max(0, j - 40), j + 80)}`);
      break;
    }
  }
}
console.log(fail ? `\n${fail} class(es) FAILED` : '\nall classes round-trip ✓'.replace('✓', 'OK'));
process.exit(fail ? 1 : 0);
