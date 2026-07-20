// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/bloodmage.json (Accursed). Awaits in-game confirmation
// (aura names "Accursed Form" / "Blood Pact" / "Blood Veil" / "Endure the Curse", Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
