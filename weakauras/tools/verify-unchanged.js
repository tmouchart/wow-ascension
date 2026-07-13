// Refactor guardrail: rebuild every class and assert its decoded output is byte-for-byte identical to
// the golden snapshot in tools/golden/. Used during the builders.js industrialization pass — a
// behavior-preserving refactor MUST leave dist/<class>.decoded.json unchanged (same ids -> same uids ->
// imports stay "Update", nothing changes in-game).
//
//   node tools/verify-unchanged.js            # rebuild all + compare to golden
//   node tools/verify-unchanged.js --snapshot # (re)write the golden snapshot from current dist
//
// Exit code 0 = all identical; 1 = a diff (or a missing golden) was found.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const GOLD = path.join(__dirname, 'golden');
const classes = fs.readdirSync(path.join(ROOT, 'classes'))
  .filter(d => fs.existsSync(path.join(ROOT, 'classes', d, 'build.js')));

execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'inherit' });

if (process.argv.includes('--snapshot')) {
  fs.mkdirSync(GOLD, { recursive: true });
  for (const c of classes) fs.copyFileSync(path.join(DIST, `${c}.decoded.json`), path.join(GOLD, `${c}.decoded.json`));
  console.log(`\nSnapshot written for ${classes.length} classes -> tools/golden/`);
  process.exit(0);
}

let bad = 0;
for (const c of classes) {
  const goldPath = path.join(GOLD, `${c}.decoded.json`);
  const curPath = path.join(DIST, `${c}.decoded.json`);
  if (!fs.existsSync(goldPath)) { console.log(`?  ${c}: no golden snapshot (run --snapshot)`); bad++; continue; }
  const gold = fs.readFileSync(goldPath, 'utf8');
  const cur = fs.readFileSync(curPath, 'utf8');
  if (gold === cur) { console.log(`OK ${c}: identical`); continue; }
  bad++;
  // report the first differing line for a quick locate
  const g = gold.split('\n'), n = cur.split('\n');
  let i = 0; while (i < g.length && i < n.length && g[i] === n[i]) i++;
  console.log(`XX ${c}: DIFF at line ${i + 1}\n   golden: ${(g[i] || '<eof>').trim().slice(0, 120)}\n   built:  ${(n[i] || '<eof>').trim().slice(0, 120)}`);
}
console.log(bad ? `\n${bad} class(es) changed — refactor is NOT output-preserving.` : `\nAll ${classes.length} classes identical to golden.`);
process.exit(bad ? 1 : 0);
