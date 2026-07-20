// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/guardian.json (Gladiator). Awaits in-game confirmation
// (aura name "Brace", Final Verdict 20% execute window, Energy power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
