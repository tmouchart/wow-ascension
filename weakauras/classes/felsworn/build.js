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
const ID_GREEN = [0.30, 0.75, 0.15, 1], ID_YELLOW = [1, 0.80, 0.10, 1];
const ID_RED = [1, 0.35, 0.05, 1], ID_DOWN = [0.70, 0.05, 0.05, 1];
const ID_GLOW = [1, 0.15, 0.10, 1];

function warnSubtext() {
  return {
    type: 'subtext', text_text: 'Inner Demon', text_visible: false, text_color: [1, 0.35, 0.30, 1],
    text_font: 'Friz Quadrata TT', text_fontSize: 12, text_fontType: 'OUTLINE',
    anchor_point: 'INNER_CENTER', text_selfPoint: 'AUTO', anchorXOffset: 0, anchorYOffset: 0,
    text_shadowColor: [0, 0, 0, 1], text_shadowXOffset: 1, text_shadowYOffset: -1,
    text_justify: 'CENTER', rotateText: 'NONE', text_wordWrap: 'WordWrap',
    text_automaticWidth: 'Auto', text_fixedWidth: 64
  };
}

const inner = B.baseBar(GROUP_ID, 'Felsworn Inner Demon');
inner.yOffset = INNER_Y; inner.width = BAR_W; inner.height = INNER_H;
inner.enableGradient = false; inner.barColor = ID_GREEN.slice(); inner.backgroundColor = [0.05, 0.08, 0.03, 0.85];
inner.triggers = B.wrap([B.T(B.buffTrigger('Inner Demon', 'showAlways'))], 1);
inner.progressSource = [-1, ''];
// subRegions: [1 bg, 2 fg, 3 border, 4 label] + append (5) warning text, (6) glow
const idLabel = inner.subRegions.find(s => s.type === 'subtext');
idLabel.text_text = 'Inner Demon  %p'; idLabel.text_fontSize = 11; idLabel.text_visible = true;
idLabel.anchor_point = 'INNER_CENTER'; idLabel.text_color = [1, 1, 1, 1];
inner.subRegions = [...inner.subRegions, warnSubtext(), B.subglow()];
inner.conditions = [
  { check: { op: '<=', trigger: 1, variable: 'expirationTime', value: '8' }, changes: [{ property: 'barColor', value: ID_YELLOW.slice() }] },
  { check: { op: '<=', trigger: 1, variable: 'expirationTime', value: '4' }, changes: [{ property: 'barColor', value: ID_RED.slice() }] },
  { check: { trigger: 1, variable: 'buffed', value: 0 },
    changes: [
      { property: 'barColor', value: ID_DOWN.slice() },
      { property: 'backgroundColor', value: [0.20, 0.02, 0.02, 0.9] },
      { property: 'sub.4.text_visible', value: false },
      { property: 'sub.5.text_visible', value: true },
      { property: 'sub.6.glow', value: true },
      { property: 'sub.6.glowType', value: 'Pixel' },
      { property: 'sub.6.useGlowColor', value: true },
      { property: 'sub.6.glowColor', value: ID_GLOW.slice() }
    ] }
];

// ---------- cooldown icons ----------
function makeIcon(cfg, parentId, size) {
  const b = B.iconBase(GROUP_ID, { id: 'Felsworn CD - ' + cfg.label, parentId, size, fallbackIcon: cfg.fallbackIcon });
  const triggerArr = [B.T(B.cooldownTrigger(cfg.spell, cfg.byName))];
  const conditions = [
    { check: { trigger: 1, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }
  ];
  // Action Button Glow (buttonOverlay) only for "use this ability now" procs/windows; defensive
  // self-buffs fall back to the Pixel green glow ("comme avant").
  const glowType = cfg.glowType || 'Pixel';
  const glowColor = cfg.glowColor || FELSWORN_GREEN;
  if (cfg.glowBuff) {
    triggerArr.push(B.T(B.buffTrigger(cfg.glowBuff)));
    conditions.push({ check: { trigger: 2, variable: 'show', value: 1 }, changes: B.glowChanges(glowColor, glowType) });
  } else if (cfg.glowTargetHealthBelow) {
    triggerArr.push(B.T(B.targetHealthTrigger()));
    conditions.push({
      check: { trigger: 2, variable: 'percenthealth', op: '<', value: String(cfg.glowTargetHealthBelow) },
      changes: B.glowChanges(glowColor, glowType)
    });
  }
  b.triggers = B.wrap(triggerArr, 1);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), B.chargesSubtext()]; }
  return b;
}

const ICONS_MAIN = [
  { label: 'Hateforged Barrier', spell: 705129, glowBuff: 'Hateforged Barrier' },
  { label: 'Demonic Will', spell: 800209, glowBuff: 'Demonic Will' },
  { label: 'Skull of Guldan', spell: 800225 },
  { label: 'Annihilation', spell: 803904 },
  { label: 'Tyrants Gaze', spell: 805240, glowTargetHealthBelow: 35, glowColor: GOLD_GLOW, glowType: 'Pixel' },
  { label: 'Reckoning', spell: 802058 },
  { label: 'Whispers of the Pit', spell: 805235 },
  { label: 'Chaos Rush', spell: 'Chaos Rush', byName: true, charges: true }
];
const ICONS_SECONDARY = [
  { label: 'Manaburn', spell: 805248 },                          // "brûlure de mana"
  { label: 'Fel Bargain', spell: 'Fel Bargain', byName: true, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_DemonicPact' },
  { label: 'Arcane Torrent', spell: 'Arcane Torrent', byName: true, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_Teleport' }
];

const mainIcons = ICONS_MAIN.map(c => makeIcon(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => makeIcon(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- Fel Fireball proc icon (own row above the CDs, centered; shows ONLY while Carve is up) ----------
// The Fel Fireball art comes from the cooldown trigger's fallback displayIcon (the by-name spell doesn't
// resolve on this client, so it falls back to the texture path — this is exactly what worked before; a
// manual iconSource:0 needs a numeric fileID, not a path, which is why it showed a "?").
// Visibility is gated by alpha: the icon is invisible (alpha 0) until the Carve proc is up, then it fades
// in + glows gold (Action Button Glow) = "cast Fel Fireball now".
const procFire = B.iconBase(GROUP_ID, {
  id: 'Felsworn Proc - Fel Fireball', parentId: GROUP_ID, size: PROC_SIZE,
  fallbackIcon: 'Interface\\Icons\\Spell_Fire_FelFireBolt'
});
procFire.yOffset = FELFIRE_Y;
procFire.alpha = 0;   // hidden until Carve is up
procFire.triggers = B.wrap([
  B.T(B.cooldownTrigger('Fel Fireball', true)),   // trigger 1: supplies the Fel Fireball icon (via fallback)
  B.T(B.buffTrigger('Carve', 'showAlways'))        // trigger 2: proc presence
], 1);
procFire.conditions = [
  { check: { trigger: 2, variable: 'buffed', value: 1 },
    changes: [{ property: 'alpha', value: 1 }, ...B.glowChanges(WHITE_GLOW, 'buttonOverlay')] }
];

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });

const group = B.makeGroup(GROUP_ID, [procFire.id, inner.id, energy.id, ...felBoxes.map(b => b.id), health.id, cdGroup.id, cd2Group.id]);
const children = [procFire, inner, energy, ...felBoxes, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];

module.exports = B.buildPackage({ name: 'felsworn', group, children });
