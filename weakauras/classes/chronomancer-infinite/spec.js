// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/chronomancer.json (Infinite). Awaits in-game confirmation
// (target debuff name "Melt Reality", Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
