// Felsworn — Tyrant (tank). Layout top -> bottom:
//   [ Fel Fireball proc row (only when Carve is up) ]
//   [ primary cooldowns ]  Inner Demon(uptime)  Energy(gold)  Felfury(green boxes)  Health(red)  [ secondary ]
// Glow = Action Button Glow (buttonOverlay) for "use this now" procs (Fel Fireball / Tyrant's Gaze <35%);
// Pixel green for defensive self-buffs. Felfury boxes glow gold when capped (6) AND Inner Demon is missing.
const B = require('../../lib/builders.js');

const GROUP_ID = 'Felsworn Tyrant';
const CD_GROUP_ID = 'Felsworn CDs';
const CD2_GROUP_ID = 'Felsworn CDs (Secondary)';

// --- colors ---
const GOLD_HI = [1, 0.88, 0.15, 1], GOLD_LO = [0.72, 0.42, 0.0, 1];   // energy gradient
const FEL_HI = [0.45, 0.90, 0.06, 1], FEL_LO = [0.10, 0.32, 0.0, 1];  // felfury fill
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];   // health gradient
const FELSWORN_GREEN = [0.337, 0.729, 0.016, 1];   // defensive self-buff glow (Pixel, "comme avant")
const GOLD_GLOW = [1, 0.82, 0.10, 1];              // gold accent (Tyrant's Gaze execute window)
const WHITE_GLOW = [1, 1, 1, 1];                   // "use this now" proc glow (Action Button Glow, white)
const EMPTY_BG = [0.09, 0.11, 0.09, 0.9];

// --- geometry (compact: everything within a 250px width, tight vertical gaps) ---
const BAR_W = 250;
const ENERGY_H = 14, FELFURY_H = 12, HEALTH_H = 14, INNER_H = 14;
const STEAL_Y = -78, STEAL_SIZE = 32;                // Consume Magic steal indicator (top of the stack)
const FELFIRE_Y = -110;                              // Fel Fireball proc row (above the CD row)
const CD_Y = -141;                                   // primary cooldown row
const INNER_Y = -164;                                // Inner Demon bar (between CDs and Energy)
const ENERGY_Y = -181, FELFURY_Y = -197, HEALTH_Y = -213;
const CD2_Y = -236;
const ICON_SIZE = 26, ICON_SIZE_2 = 24, PROC_SIZE = 30;
const MAX_FELFURY = 6, FEL_GAP = 4;
const BOX_W = (BAR_W - (MAX_FELFURY - 1) * FEL_GAP) / MAX_FELFURY;   // felfury boxes span the bar width
const PITCH = BOX_W + FEL_GAP;

// ---------- Energy bar ----------
const energy = B.baseBar(GROUP_ID, 'Felsworn Energy');
energy.yOffset = ENERGY_Y; energy.width = BAR_W; energy.height = ENERGY_H;
B.gradient(energy, GOLD_HI, GOLD_LO);
energy.backgroundColor = [0.12, 0.1, 0.0, 0.8];
energy.triggers = B.wrap([B.T(B.powerTrigger(3))], -10);   // 3 = Energy
B.barText(energy, '%p', 11);

// ---------- Felfury boxes ----------
const startX = -((MAX_FELFURY - 1) * PITCH) / 2;
const felBoxes = [];
for (let i = 1; i <= MAX_FELFURY; i++) {
  const b = B.segmentBar(GROUP_ID, {
    id: 'Felsworn Felfury ' + i, index: i,
    unit: 'player', debuffType: 'HELPFUL', auraNames: ['Felfury'],
    hiColor: FEL_HI, loColor: FEL_LO, emptyBg: EMPTY_BG,
    width: BOX_W, height: FELFURY_H, xOffset: startX + (i - 1) * PITCH, yOffset: FELFURY_Y
  });
  // trigger 3 = Inner Demon presence; glow the box gold when capped (6) AND Inner Demon missing
  // (that's the moment to dump Felfury into Inner Demon for the 60-energy refund).
  b.triggers.__array.push(B.T(B.buffTrigger('Inner Demon', 'showAlways')));
  b.subRegions = [...b.subRegions, B.subglow()];     // -> sub.5
  b.conditions.push({
    check: { checks: [
      { op: '>=', trigger: 1, variable: 'stacks', value: '6' },
      { trigger: 3, variable: 'buffed', value: 0 }
    ], trigger: -2, variable: 'AND' },
    changes: [
      { property: 'sub.5.glow', value: true },
      { property: 'sub.5.glowType', value: 'Pixel' },
      { property: 'sub.5.useGlowColor', value: true },
      { property: 'sub.5.glowColor', value: GOLD_GLOW.slice() }
    ]
  });
  felBoxes.push(b);
}

// ---------- Health bar ----------
const health = B.baseBar(GROUP_ID, 'Felsworn Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
B.gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = B.wrap([B.T(B.healthTrigger('player'))], -10);
B.barText(health, '%p', 11);

// ---------- Inner Demon uptime bar (KEEP UP 24/7) ----------
// Sits between the cooldown row and the Energy bar, same height as Energy. Trigger 1 = the Inner Demon
// buff (drives the duration progress + up/down state). green -> yellow (<=8s) -> red (<=4s); when it
// falls off the bar goes deep red, a red pixel glow pulses, and the label swaps to "Inner demon missing".
// (The "refresh at 6 Felfury" cue lives on the Felfury boxes, not here.)
const inner = B.uptimeBar(GROUP_ID, { id: 'Felsworn Inner Demon', yOffset: INNER_Y, width: BAR_W, height: INNER_H,
  buff: 'Inner Demon', label: 'Inner Demon  %p', warnText: 'Inner Demon', bg: [0.05, 0.08, 0.03, 0.85] });

// ---------- cooldown icons (shared B.cooldownIcon; glow color/style is explicit data) ----------
// glowBuff -> Pixel green while the defensive self-buff it grants is active ("comme avant").
// glowTargetHealthBelow -> gold accent while the target is in the execute window.
const mk = (cfg, parentId, size) => B.cooldownIcon({ ...cfg, id: 'Felsworn CD - ' + cfg.label, parentId, size });
const BUFF_GLOW = { glowColor: FELSWORN_GREEN, glowType: 'Pixel' };

// Icons that grant a self-buff carry glowBuff: while the buff is up the icon shows the BUFF's duration +
// glows Pixel green (Skull of Gul'dan / Annihilation buff names assumed = spell name; CONFIRM IN-GAME).
const ICONS_MAIN = [
  { label: 'Hateforged Barrier', spell: 705129, glowBuff: 'Hateforged Barrier', ...BUFF_GLOW },
  { label: 'Demonic Will', spell: 800209, glowBuff: 'Demonic Will', ...BUFF_GLOW },
  { label: 'Skull of Guldan', spell: 800225, glowBuff: "Skull of Gul'dan", ...BUFF_GLOW },
  { label: 'Annihilation', spell: 803904, glowBuff: 'Annihilation', ...BUFF_GLOW },
  { label: 'Blood of Mannoroth', spell: 802075 },                // offensive CD (custom @ spell)
  { label: 'Reckoning', spell: 802058 },
  { label: 'Chaos Rush', spell: 'Chaos Rush', byName: true, charges: true }
];
const ICONS_SECONDARY = [
  { label: 'Whispers of the Pit', spell: 805235 },               // moved down to the secondary row
  { label: 'Manaburn', spell: 805248 },                          // "brulure de mana"
  { label: 'Fel Bargain', spell: 'Fel Bargain', byName: true, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_DemonicPact' },
  { label: 'Arcane Torrent', spell: 'Arcane Torrent', byName: true, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_Teleport' }
];

const mainIcons = ICONS_MAIN.map(c => mk(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => mk(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- proc row (above the CDs): Fel Fireball (left) + Tyrant's Gaze execute proc (right) ----------
// Fel Fireball: art from the cooldown trigger's fallback displayIcon (the by-name spell doesn't resolve on
// this client, so it falls back to the texture path — a manual iconSource:0 needs a numeric fileID, not a
// path, which is why it showed a "?"). Visibility gated by alpha: invisible (alpha 0) until the Carve proc
// is up, then it fades in + glows white (Action Button Glow) = "cast Fel Fireball now".
const procFire = B.iconBase(GROUP_ID, {
  id: 'Felsworn Proc - Fel Fireball', parentId: GROUP_ID, size: PROC_SIZE,
  fallbackIcon: 'Interface\\Icons\\Spell_Fire_FelFireBolt'
});
procFire.xOffset = -17; procFire.yOffset = FELFIRE_Y;   // left half of the proc row
procFire.alpha = 0;   // hidden until Carve is up
procFire.triggers = B.wrap([
  B.T(B.cooldownTrigger('Fel Fireball', true)),   // trigger 1: supplies the Fel Fireball icon (via fallback)
  B.T(B.buffTrigger('Carve', 'showAlways'))        // trigger 2: proc presence
], 1);
procFire.conditions = [
  { check: { trigger: 2, variable: 'buffed', value: 1 },
    changes: [{ property: 'alpha', value: 1 }, ...B.glowChanges(WHITE_GLOW, 'buttonOverlay')] }
];

// Tyrant's Gaze execute proc (right half of the proc row) — moved OUT of the cooldown row: it's an
// execute-window tool. targetExecuteTrigger(35) (custom UnitHealth stateupdate) controls show, so the icon
// only exists while the target is under 35% HP; trigger 2 supplies the spell art (iconSource 2) + cooldown.
// activeTriggerMode 2 = the cooldown trigger drives the display, so while it's on cooldown the icon shows
// the cooldown swipe + countdown (desaturated); when ready it goes full-color + white Action Button Glow.
const procTyrant = B.iconBase(GROUP_ID, {
  id: 'Felsworn Proc - Tyrants Gaze', parentId: GROUP_ID, size: PROC_SIZE,
  fallbackIcon: 'Interface\\Icons\\inv_summondemonictyrant'
});
procTyrant.xOffset = 17; procTyrant.yOffset = FELFIRE_Y; procTyrant.iconSource = 2;
procTyrant.triggers = B.wrap([
  B.T(B.targetExecuteTrigger(35)),   // trigger 1 (controls show): target exists AND < 35% HP
  B.T(B.cooldownTrigger(805240))     // trigger 2: Tyrant's Gaze art + cooldown (drives the swipe)
], 2);
// 'all', NOT 'any': the cooldown trigger is showAlways (always active), so with 'any' the icon would
// show permanently. 'all' means shown only when the execute trigger is ALSO active (target < 35% HP).
procTyrant.triggers.disjunctive = 'all';
procTyrant.conditions = [
  { check: { trigger: 2, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] },   // down -> grey + show CD swipe
  { check: { trigger: 2, variable: 'onCooldown', value: 0 }, changes: B.glowChanges(WHITE_GLOW, 'buttonOverlay') }   // ready -> white glow
];

// ---------- Consume Magic steal indicator (standalone icon at the top of the stack) ----------
// "Can I steal a buff off my target?" A single aura2 trigger with the `use_stealable` filter matches ANY
// stealable (magic) buff on the target — not by name — so it catches every one. matchesShowOn 'showOnActive'
// means the icon only exists while such a buff is up (no alpha gating needed: the trigger itself drives
// show/hide). iconSource -1 pulls the matched buff's OWN icon, and it glows white (Action Button Glow) =
// "Consume Magic this now". Depends on the client exposing aura stealable-ness to WeakAuras — confirm in-game.
const procSteal = B.iconBase(GROUP_ID, {
  id: 'Felsworn Proc - Consume Magic', parentId: GROUP_ID, size: STEAL_SIZE,
  fallbackIcon: 'Interface\\Icons\\Spell_Arcane_ManaTap'
});
procSteal.yOffset = STEAL_Y;
procSteal.triggers = B.wrap([B.T(B.stealableTargetTrigger())], 1);
procSteal.conditions = [
  { check: { trigger: 1, variable: 'show', value: 1 }, changes: B.glowChanges(WHITE_GLOW, 'buttonOverlay') }
];

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });

const group = B.makeGroup(GROUP_ID, [procSteal.id, procFire.id, procTyrant.id, inner.id, energy.id, ...felBoxes.map(b => b.id), health.id, cdGroup.id, cd2Group.id]);
const children = [procSteal, procFire, procTyrant, inner, energy, ...felBoxes, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];

module.exports = B.buildPackage({ name: 'felsworn', group, children });
