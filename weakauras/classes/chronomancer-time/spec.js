// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/chronomancer.json (Time). Awaits in-game confirmation
// (Mana power index). Accelerated Recovery is an ally HoT the aura2 engine cannot track.
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
