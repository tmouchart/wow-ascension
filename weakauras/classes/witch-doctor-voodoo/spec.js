// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/witch-doctor.json (Voodoo). Awaits in-game confirmation
// (target-debuff name "Hex of Malice", Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
