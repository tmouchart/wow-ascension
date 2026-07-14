// Node-side wrapper over the isomorphic engine (builders-core.js): adds the encode/write/rotate
// pipeline (`buildPackage`) that needs fs + the zlib codec. Re-exports everything from core, so
// existing `require('./builders.js')` call sites (class build.js files) are unchanged.
const fs = require('fs');
const path = require('path');
const { encodeWA, decodeWA } = require('./wa-codec.js');
const core = require('./builders-core.js');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// ---------- assemble + encode + write (rotates the previous import) ----------
function buildPackage({ name, group, children, combatOnly }) {
  const top = core.assembleTop({ group, children, combatOnly });
  const str = encodeWA(top);
  const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
  if (!ok) throw new Error(`[${name}] self round-trip FAILED — refusing to write`);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const cur = path.join(DIST_DIR, `${name}.import.txt`);
  const prev = path.join(DIST_DIR, `${name}.prev.import.txt`);
  if (fs.existsSync(cur)) fs.copyFileSync(cur, prev);   // rotate: current -> previous
  fs.writeFileSync(cur, str);
  fs.writeFileSync(path.join(DIST_DIR, `${name}.decoded.json`), JSON.stringify(top, null, 2));

  console.log(`[${name}] dist/${name}.import.txt (${str.length} chars) | round-trip: ${ok} | regions: ${children.length}`);
  return { str, ok, top };
}

module.exports = { ...core, buildPackage, DIST_DIR };
