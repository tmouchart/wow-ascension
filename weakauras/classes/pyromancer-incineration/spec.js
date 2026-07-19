// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/pyromancer.json (Incineration). Awaits in-game confirmation
// (aura names "Flamecasting" / "Fired Up" / "Ignite" / "Infernus", Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
