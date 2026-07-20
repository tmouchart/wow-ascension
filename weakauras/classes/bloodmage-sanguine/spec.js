// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/bloodmage.json (Sanguine). Awaits in-game confirmation
// (aura names "Transgression" / "Malediction" / "Thirst", Thirst stack cap, Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
