// Barbarian — Brutality. Layout top -> bottom:
//   [ primary cooldowns ]  Unbridled Rage(uptime)  Energy(gold)  Health(red)  [ secondary CDs ]
// Brutality is a pure Energy execute spec (Decapitate converts extra Energy to damage; no combo-point
// resource). Unbridled Rage is the keep-up-24/7 maintenance buff (many talents extend it).
// Glow = Action Button Glow (buttonOverlay) for "act now" cues (Decapitate execute window < 20% HP =
// gold; Unbridled Rage cast when its buff has dropped = white). Pixel class-color for defensive buffs.
const B = require('../../lib/builders.js');

const GROUP_ID = 'Barbarian Brutality';
const CD_GROUP_ID = 'Barbarian CDs';
const CD2_GROUP_ID = 'Barbarian CDs (Secondary)';

// --- colors ---
const GOLD_HI = [1, 0.88, 0.15, 1], GOLD_LO = [0.72, 0.42, 0.0, 1];   // energy gradient
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];   // health gradient
const BARB_COLOR = [0.78, 0.61, 0.43, 1];          // class identity (warrior tan) - defensive Pixel glow
const GOLD_GLOW = [1, 0.82, 0.10, 1];              // execute-window cue (Decapitate < 20% HP)
const WHITE_GLOW = [1, 1, 1, 1];                   // "act now" cue (recast Unbridled Rage)

// --- geometry (compact: everything within a 250px width, tight vertical gaps) ---
const BAR_W = 250;
const UR_H = 14, ENERGY_H = 14, HEALTH_H = 14;
const CD_Y = -140;                                   // primary cooldown row
const UR_Y = -164;                                   // Unbridled Rage uptime bar
const ENERGY_Y = -181, HEALTH_Y = -198;
const CD2_Y = -221;
const ICON_SIZE = 26, ICON_SIZE_2 = 24;

// ---------- Energy bar ----------
const energy = B.baseBar(GROUP_ID, 'Barbarian Energy');
energy.yOffset = ENERGY_Y; energy.width = BAR_W; energy.height = ENERGY_H;
B.gradient(energy, GOLD_HI, GOLD_LO);
energy.backgroundColor = [0.12, 0.1, 0.0, 0.8];
energy.triggers = B.wrap([B.T(B.powerTrigger(3))], -10);   // 3 = Energy
B.barText(energy, '%p', 11);

// ---------- Health bar ----------
const health = B.baseBar(GROUP_ID, 'Barbarian Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
B.gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = B.wrap([B.T(B.healthTrigger('player'))], -10);
B.barText(health, '%p', 11);

// ---------- Unbridled Rage uptime bar (KEEP UP 24/7) ----------
// Sits between the cooldown row and Energy. Trigger 1 = the Unbridled Rage buff (duration progress +
// up/down state). green -> yellow (<=8s) -> red (<=4s); when it falls off the bar goes deep red, a red
// pixel glow pulses, and the label swaps to "Unbridled Rage missing". (The recast cue also lights the
// Unbridled Rage icon in the CD row.)
const UR_GREEN = [0.30, 0.75, 0.15, 1], UR_YELLOW = [1, 0.80, 0.10, 1];
const UR_RED = [1, 0.35, 0.05, 1], UR_DOWN = [0.70, 0.05, 0.05, 1];
const UR_GLOW = [1, 0.15, 0.10, 1];
const UR_BUFF = 'Unbridled Rage';   // baseline buff, tracked by name - confirm the name resolves in-game

function warnSubtext() {
  return {
    type: 'subtext', text_text: 'Rage DOWN', text_visible: false, text_color: [1, 0.35, 0.30, 1],
    text_font: 'Friz Quadrata TT', text_fontSize: 12, text_fontType: 'OUTLINE',
    anchor_point: 'INNER_CENTER', text_selfPoint: 'AUTO', anchorXOffset: 0, anchorYOffset: 0,
    text_shadowColor: [0, 0, 0, 1], text_shadowXOffset: 1, text_shadowYOffset: -1,
    text_justify: 'CENTER', rotateText: 'NONE', text_wordWrap: 'WordWrap',
    text_automaticWidth: 'Auto', text_fixedWidth: 64
  };
}

const ur = B.baseBar(GROUP_ID, 'Barbarian Unbridled Rage');
ur.yOffset = UR_Y; ur.width = BAR_W; ur.height = UR_H;
ur.enableGradient = false; ur.barColor = UR_GREEN.slice(); ur.backgroundColor = [0.06, 0.05, 0.02, 0.85];
ur.triggers = B.wrap([B.T(B.buffTrigger(UR_BUFF, 'showAlways'))], 1);
ur.progressSource = [-1, ''];
// subRegions: [1 bg, 2 fg, 3 border, 4 label] + append (5) warning text, (6) glow
const urLabel = ur.subRegions.find(s => s.type === 'subtext');
urLabel.text_text = 'Unbridled Rage  %p'; urLabel.text_fontSize = 11; urLabel.text_visible = true;
urLabel.anchor_point = 'INNER_CENTER'; urLabel.text_color = [1, 1, 1, 1];
ur.subRegions = [...ur.subRegions, warnSubtext(), B.subglow()];
ur.conditions = [
  { check: { op: '<=', trigger: 1, variable: 'expirationTime', value: '8' }, changes: [{ property: 'barColor', value: UR_YELLOW.slice() }] },
  { check: { op: '<=', trigger: 1, variable: 'expirationTime', value: '4' }, changes: [{ property: 'barColor', value: UR_RED.slice() }] },
  { check: { trigger: 1, variable: 'buffed', value: 0 },
    changes: [
      { property: 'barColor', value: UR_DOWN.slice() },
      { property: 'backgroundColor', value: [0.20, 0.02, 0.02, 0.9] },
      { property: 'sub.4.text_visible', value: false },
      { property: 'sub.5.text_visible', value: true },
      { property: 'sub.6.glow', value: true },
      { property: 'sub.6.glowType', value: 'Pixel' },
      { property: 'sub.6.useGlowColor', value: true },
      { property: 'sub.6.glowColor', value: UR_GLOW.slice() }
    ] }
];

// ---------- cooldown icons ----------
// glowTargetHealthBelow -> gold Action Button Glow while target is in the execute window.
// glowBuffMissing       -> white Action Button Glow when a maintenance buff has dropped (recast now).
// glowBuff              -> Pixel class-color while a defensive self-buff is active.
function makeIcon(cfg, parentId, size) {
  const b = B.iconBase(GROUP_ID, { id: 'Barbarian CD - ' + cfg.label, parentId, size, fallbackIcon: cfg.fallbackIcon });
  const triggerArr = [B.T(B.cooldownTrigger(cfg.spell, cfg.byName))];
  const conditions = [
    { check: { trigger: 1, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }
  ];
  if (cfg.glowTargetHealthBelow) {
    triggerArr.push(B.T(B.targetHealthTrigger()));
    conditions.push({
      check: { trigger: triggerArr.length, variable: 'percenthealth', op: '<', value: String(cfg.glowTargetHealthBelow) },
      changes: B.glowChanges(GOLD_GLOW, 'buttonOverlay')
    });
  }
  if (cfg.glowBuffMissing) {
    triggerArr.push(B.T(B.buffTrigger(cfg.glowBuffMissing, 'showAlways')));
    conditions.push({
      check: { trigger: triggerArr.length, variable: 'buffed', value: 0 },
      changes: B.glowChanges(WHITE_GLOW, 'buttonOverlay')
    });
  }
  if (cfg.glowBuff) {
    triggerArr.push(B.T(B.buffTrigger(cfg.glowBuff)));
    conditions.push({
      check: { trigger: triggerArr.length, variable: 'show', value: 1 },
      changes: B.glowChanges(BARB_COLOR, 'Pixel')
    });
  }
  b.triggers = B.wrap(triggerArr, 1);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), B.chargesSubtext()]; }
  return b;
}

// Primary row. Talent spells carry real castable spellIds; baseline (Smash/Carnage/Unbridled Rage) are
// tracked by name (flagged) with a fallback texture path so they never render as "?".
const ICONS_MAIN = [
  { label: 'Decapitate', spell: 804414, glowTargetHealthBelow: 20 },   // execute; gold glow < 20% HP
  { label: 'Crush', spell: 500915 },
  { label: 'Storm of Steel', spell: 800637 },
  { label: 'Killing Spree', spell: 850021 },
  { label: 'Brutal Swing', spell: 500913 },
  { label: 'Smash', spell: 'Smash', byName: true, fallbackIcon: 'Interface\\Icons\\Ability_Warrior_Devastate' },
  { label: 'Carnage', spell: 'Carnage', byName: true, fallbackIcon: 'Interface\\Icons\\Ability_Warrior_Rampage' },
  { label: 'Unbridled Rage', spell: 'Unbridled Rage', byName: true, glowBuffMissing: UR_BUFF,
    fallbackIcon: 'Interface\\Icons\\Ability_Warrior_InnerRage' }
];
// Secondary row: defensives / utility (real talent spellIds).
const ICONS_SECONDARY = [
  { label: 'Defiance', spell: 806228, glowBuff: 'Defiance' },     // damage-reduction defensive
  { label: 'Thick Skull', spell: 801549, glowBuff: 'Thick Skull' },  // stun immunity
  { label: 'Hodirs Wrath', spell: 800152 }                        // AoE burst + full Energy restore
];

const mainIcons = ICONS_MAIN.map(c => makeIcon(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => makeIcon(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });

const group = B.makeGroup(GROUP_ID, [ur.id, energy.id, health.id, cdGroup.id, cd2Group.id]);
const children = [ur, energy, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];

module.exports = B.buildPackage({ name: 'barbarian-brutality', group, children });
