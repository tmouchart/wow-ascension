// Cultist — COMMON package (spec-agnostic: baseline + class-tree abilities every spec shares).
// Custom classes aren't gated by spec load conditions, so one package covers Godblade / Corruption /
// Dreadnought / Heretic. Layout top -> bottom (compact central stack, 250px wide):
//   [ primary CD row ]  Insanity(void purple)  Mana(blue)  Health(red)  [ defensive/utility CD row ]
// Glow = Action Button Glow (white) when the signature Gaze of C'Thun is READY; Pixel class-purple while
// a defensive self-buff (Abyssal Ward / Embrace the Void / Doomcloak) is active.
const B = require('../../lib/builders.js');

const GROUP_ID = 'Cultist';
const CD_GROUP_ID = 'Cultist CDs';
const CD2_GROUP_ID = 'Cultist CDs (Defensive)';

// --- colors ---
const INS_HI = [0.72, 0.30, 0.90, 1], INS_LO = [0.25, 0.05, 0.40, 1];  // Insanity (void purple)
const MANA_HI = [0.25, 0.45, 0.95, 1], MANA_LO = [0.05, 0.10, 0.35, 1]; // Mana (blue)
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];     // Health (red)
const CULT_PURPLE = [0.58, 0.24, 0.82, 1];   // class color -> Pixel glow for defensive self-buffs
const WHITE_GLOW = [1, 1, 1, 1];             // Action Button Glow -> Gaze of C'Thun ready

// --- resource model ---
// Insanity is NOT a power type on this client: it's an AURA named "Insanity" on the player that stacks up
// to 100. So the Insanity bar is driven by that aura's stack count (progressSource -> trigger 1 "stacks",
// max pinned to 100), read via aura2 (the only portable aura read here). debuffType "BOTH" scans buffs AND
// debuffs, so it matches whether Insanity registers as a buff or a debuff. CONFIRM the exact name in-game.
const INSANITY_MAX = 100;
const MANA_PT = 0;

// --- geometry (compact central stack) ---
const BAR_W = 250;
const INS_H = 14, MANA_H = 14, HEALTH_H = 14;
const CD_Y = -110;                     // primary cooldown row (26px icons)
const INS_Y = -135;                    // Insanity bar
const MANA_Y = -152;                   // Mana bar
const HEALTH_Y = -169;                 // Health bar
const CD2_Y = -195;                    // defensive/utility row (24px icons)
const ICON_SIZE = 26, ICON_SIZE_2 = 24;

// ---------- Insanity bar (primary resource = stacks of the "Insanity" aura, 0..100) ----------
const insanity = B.baseBar(GROUP_ID, 'Cultist Insanity');
insanity.yOffset = INS_Y; insanity.width = BAR_W; insanity.height = INS_H;
B.gradient(insanity, INS_HI, INS_LO);
insanity.backgroundColor = [0.10, 0.04, 0.14, 0.85];
// trigger 1 = the "Insanity" aura on the player (showAlways so stacks read 0..100 whether or not it's up)
insanity.triggers = B.wrap([B.T({
  type: 'aura2', unit: 'player', debuffType: 'BOTH', useName: true, auranames: ['Insanity'],
  names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
  unitExists: true, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
})], 1);
// drive the bar's fill from the aura's stack count, pinned to a max of 100
insanity.progressSource = [1, 'stacks'];
insanity.useAdjustededMax = true; insanity.adjustedMax = String(INSANITY_MAX);
B.barText(insanity, '%p', 11);

// ---------- Mana bar ----------
const mana = B.baseBar(GROUP_ID, 'Cultist Mana');
mana.yOffset = MANA_Y; mana.width = BAR_W; mana.height = MANA_H;
B.gradient(mana, MANA_HI, MANA_LO);
mana.backgroundColor = [0.03, 0.05, 0.15, 0.85];
mana.triggers = B.wrap([B.T(B.powerTrigger(MANA_PT))], -10);
B.barText(mana, '%p', 11);

// ---------- Health bar ----------
const health = B.baseBar(GROUP_ID, 'Cultist Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
B.gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = B.wrap([B.T(B.healthTrigger('player'))], -10);
B.barText(health, '%p', 11);

// ---------- cooldown icons ----------
const mk = (cfg, parentId, size) => B.cooldownIcon({ ...cfg, id: 'Cultist CD - ' + cfg.label, parentId, size });
const BUFF_GLOW = { glowColor: CULT_PURPLE, glowType: 'Pixel' };

// Primary row: baseline core + a couple of class-tree builders shared by every spec.
// Blade of the Empire is a charge builder -> show the charge count (%s subtext). Gaze of C'Thun is the
// signature baseline ability -> white Action Button glow when it comes off cooldown.
const ICONS_MAIN = [
  { label: 'Blade of the Empire', spell: 500720, charges: true },
  { label: 'Gaze of CThun', spell: 500110, glowReady: true, glowColor: WHITE_GLOW, glowType: 'buttonOverlay' },
  { label: 'Horrorbolt', spell: 800416 },
  { label: 'Corrupt Mind', spell: 560109 },
  { label: 'Devour Magic', spell: 520151 },
  { label: 'Eldritch Mending', spell: 500711 }
];

// Defensive/utility row: class-tree survivability every spec can take. Icons that grant a self-buff carry
// glowBuff -> while the buff is up the icon shows the BUFF's remaining duration + glows Pixel class-purple.
// Buff names are ASSUMED = spell name; CONFIRM IN-GAME.
const ICONS_SECONDARY = [
  { label: 'Abyssal Ward', spell: 804670, glowBuff: 'Abyssal Ward', ...BUFF_GLOW },
  { label: 'Embrace the Void', spell: 582591, glowBuff: 'Embrace the Void', ...BUFF_GLOW },
  { label: 'Doomcloak', spell: 502134, glowBuff: 'Doomcloak', ...BUFF_GLOW },
  { label: 'Void Shield', spell: 500715 },
  { label: 'Hallucination', spell: 560301 },
  { label: 'Satiate', spell: 804275 }
];

const mainIcons = ICONS_MAIN.map(c => mk(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => mk(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });

const group = B.makeGroup(GROUP_ID, [insanity.id, mana.id, health.id, cdGroup.id, cd2Group.id]);
const children = [insanity, mana, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];

module.exports = B.buildPackage({ name: 'cultist', group, children });
