// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/cultist.json (Godblade). Awaits in-game confirmation
// (aura names "Voidborne" / "Insanity", Insanity stack cap, Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
