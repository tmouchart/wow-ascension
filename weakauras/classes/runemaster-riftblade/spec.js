// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/runemaster.json (Riftblade). Awaits in-game confirmation
// (weapon-engraving trigger needs GetWeaponEnchantInfo; Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
