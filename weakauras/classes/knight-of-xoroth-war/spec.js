// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/knight-of-xoroth.json (War). Awaits in-game confirmation
// (Demonfire aura name + cap, Pestilence of Death buff name, Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
