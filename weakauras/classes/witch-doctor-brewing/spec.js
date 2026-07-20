// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/witch-doctor.json (Brewing). Awaits in-game confirmation
// (Mana power index; no ingredient/brew resource modelled - no named stacking aura).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
