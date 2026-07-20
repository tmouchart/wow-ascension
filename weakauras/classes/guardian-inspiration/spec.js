// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/guardian.json (Inspiration). Awaits in-game confirmation
// (aura names "Hero's March" + "Brace", Energy power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
