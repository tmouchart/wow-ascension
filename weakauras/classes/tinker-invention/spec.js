// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/tinker.json (Invention). Awaits in-game confirmation
// (aura name "Kinetic Shield", Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
