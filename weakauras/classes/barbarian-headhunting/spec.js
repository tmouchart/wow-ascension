// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/barbarian.json (Headhunting). Awaits in-game confirmation
// (enrage aura names "Unbridled Rage"/"Onslaught"/"Battle Vigor", Energy power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
