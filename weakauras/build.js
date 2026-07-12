#!/usr/bin/env node
// CLI: build one class package (or all) into dist/.
//   node build.js              -> build every class
//   node build.js felsworn     -> build one class
//   node build.js felsworn runemaster
//
// Each class lives in classes/<name>/build.js and writes dist/<name>.import.txt
// (rotating the prior string to dist/<name>.prev.import.txt). No per-version files.
const fs = require('fs');
const path = require('path');

const CLASSES_DIR = path.join(__dirname, 'classes');
const available = fs.readdirSync(CLASSES_DIR)
  .filter(n => fs.existsSync(path.join(CLASSES_DIR, n, 'build.js')));

let names = process.argv.slice(2);
if (names.length === 0 || names[0] === 'all') names = available;

const unknown = names.filter(n => !available.includes(n));
if (unknown.length) {
  console.error(`Unknown class(es): ${unknown.join(', ')}`);
  console.error(`Available: ${available.join(', ')}`);
  process.exit(1);
}

for (const name of names) require(path.join(CLASSES_DIR, name, 'build.js'));
