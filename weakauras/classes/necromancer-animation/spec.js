// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/necromancer.json (Uanimation). Awaits in-game confirmation
// (disease/buff aura names, Runic Power power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
