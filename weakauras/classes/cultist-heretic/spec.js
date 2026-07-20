// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/cultist.json (Heretic). Awaits in-game confirmation
// (aura names "Insanity" / defensive buff names, Insanity stack cap, Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
