// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/witch-doctor.json (Shadowhunting). Awaits in-game confirmation
// (target-debuff name "Eye of Kimbul", Mana power index; Spirits pool not modelled).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
