// Felsworn — Tyrant, expressed as a declarative SPEC (basics only) to prove lib/spec-builder.js.
// Top -> bottom: Fel Fireball proc row | primary CD row | Energy | Felfury x6 | Health | secondary CD row.
// Outputs dist/felsworn-spec.* (kept separate from the known-good hand-built `felsworn`).
const { specToPackage } = require('../../lib/spec-builder.js');

// colors (same identity as classes/felsworn/build.js)
const GOLD_HI = [1, 0.88, 0.15, 1], GOLD_LO = [0.72, 0.42, 0.0, 1];
const FEL_HI = [0.45, 0.90, 0.06, 1], FEL_LO = [0.10, 0.32, 0.0, 1];
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];
const GREEN = [0.337, 0.729, 0.016, 1];   // defensive self-buff glow
const GOLD_GLOW = [1, 0.82, 0.10, 1];
const WHITE = [1, 1, 1, 1];

const spec = {
  id: 'Felsworn Tyrant SPEC',
  name: 'felsworn-spec',
  global: { barWidth: 250, iconSize: 26, secIconSize: 24, procSize: 30, gap: 3 },
  stack: [
    { kind: 'procRow', icons: [
      { label: 'Fel Fireball', spell: 'Fel Fireball', byName: true, buff: 'Carve',
        fallbackIcon: 'Interface\\Icons\\Spell_Fire_FelFireBolt', glowColor: WHITE, glowType: 'buttonOverlay' },
    ] },
    { kind: 'cdRow', icons: [
      { label: 'Hateforged Barrier', spell: 705129, glow: { type: 'buff', buff: 'Hateforged Barrier', color: GREEN, glowType: 'Pixel' } },
      { label: 'Demonic Will', spell: 800209, glow: { type: 'buff', buff: 'Demonic Will', color: GREEN, glowType: 'Pixel' } },
      { label: 'Skull of Guldan', spell: 800225 },
      { label: 'Annihilation', spell: 803904 },
      { label: 'Tyrants Gaze', spell: 805240, glow: { type: 'targetHealthBelow', pct: 35, color: GOLD_GLOW, glowType: 'Pixel' } },
      { label: 'Reckoning', spell: 802058 },
      { label: 'Whispers of the Pit', spell: 805235 },
      { label: 'Chaos Rush', spell: 'Chaos Rush', byName: true, charges: true },
    ] },
    { kind: 'uptimeBar', buff: 'Inner Demon', label: 'Inner Demon  %p', warnText: 'Inner Demon', bg: [0.05, 0.08, 0.03, 0.85] },
    { kind: 'powerBar', powerType: 3, hi: GOLD_HI, lo: GOLD_LO, bg: [0.12, 0.1, 0.0, 0.8] },
    { kind: 'stacks', auraNames: ['Felfury'], count: 6, hi: FEL_HI, lo: FEL_LO },
    { kind: 'healthBar', hi: HP_HI, lo: HP_LO },
    { kind: 'cdRow', secondary: true, icons: [
      { label: 'Manaburn', spell: 805248 },
      { label: 'Fel Bargain', spell: 'Fel Bargain', byName: true, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_DemonicPact' },
      { label: 'Arcane Torrent', spell: 'Arcane Torrent', byName: true, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_Teleport' },
    ] },
  ],
};

module.exports = specToPackage(spec);
