// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/pyromancer.json (Draconic). Awaits in-game confirmation
// (aura name "Flamecasting", Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
