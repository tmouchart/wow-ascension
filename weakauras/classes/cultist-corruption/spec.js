// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/cultist.json (Corruption). Awaits in-game confirmation
// (debuff names "Ancient Curse" / "Darkwither", aura "Insanity", Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
