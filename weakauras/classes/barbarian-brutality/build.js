// Barbarian — Brutality. Layout (friend's design):
//
//                 [ Warspear self-buff ]
//                     [ CRUSH (big) ]
//   DEF               [ spell row ]                OFF
//  column   Whirling Adv · Decap · Headbutt · Jaw  column
// (vertical)     [ Rage uptime ("Rage") bar ]    (vertical)
//   left         [ Rage bar (pink, big) ]         right
//                [ Health bar ]
//                [ Decapitate PROC (target <35%) ]
//
// Brutality is a pure Energy ("Rage") execute spec. Everything loads IN COMBAT ONLY (use_combat)
// so the whole package hides out of combat. Glow = Action Button Glow (buttonOverlay) for "act
// now" cues (Crush ready = white; Decapitate usable at >=60% Rage = gold; Decapitate execute proc
// <35% = white; Unbridled Rage dropped = white). Pixel class-color = a defensive/raid self-buff up.
const B = require('../../lib/builders.js');

const GROUP_ID = 'Barbarian Brutality';
const CD_OFF_ID = 'Barbarian CDs (Offensive)';
const CD_DEF_ID = 'Barbarian CDs (Defensive)';
const SPELL_ID = 'Barbarian Spells';

// --- colors ---
const RAGE_HI = [0.98, 0.42, 0.72, 1], RAGE_LO = [0.60, 0.10, 0.38, 1];   // Rage bar = pink gradient
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];       // health gradient
const BARB_COLOR = [0.78, 0.61, 0.43, 1];          // class identity (warrior tan) - defensive/raid Pixel glow
const GOLD_GLOW = [1, 0.82, 0.10, 1];              // Decapitate usable (>=60% Rage)
const WHITE_GLOW = [1, 1, 1, 1];                   // "act now" cue (Crush ready / execute proc / recast)

// --- geometry ---
const BAR_W = 250;
const RAGE_W = 280, RAGE_H = 22;                   // Rage bar enlarged again (bigger + pink)
const UR_H = 14, HEALTH_H = 14;
const ICON_FEAT = 46, ICON_SPELL = 30, ICON_CD = 26, ICON_BUFF = 20, ICON_PROC = 34;
// central column (x ~ 0), top -> bottom
const WARN_Y = -58, FEAT_Y = -104, SPELL_Y = -146;
const UR_Y = -172, RAGE_Y = -197, HEALTH_Y = -221, PROC_Y = -250;
// vertical side columns flanking the whole WA
const DEF_X = -170, OFF_X = 170;
const DEF_Y = -180, OFF_Y = -185;

// ---------- Rage (Energy) bar — enlarged + pink ----------
const rage = B.baseBar(GROUP_ID, 'Barbarian Energy');
rage.yOffset = RAGE_Y; rage.width = RAGE_W; rage.height = RAGE_H;
B.gradient(rage, RAGE_HI, RAGE_LO);
rage.backgroundColor = [0.14, 0.03, 0.09, 0.85];
rage.triggers = B.wrap([B.T(B.powerTrigger(3))], -10);   // 3 = Energy
B.barText(rage, '%p', 13);

// ---------- Health bar ----------
const health = B.baseBar(GROUP_ID, 'Barbarian Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
B.gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = B.wrap([B.T(B.healthTrigger('player'))], -10);
B.barText(health, '%p', 11);

// ---------- Enrage uptime bar ----------
// "Am I in a Rage phase?" — up while ANY of Unbridled Rage / Onslaught / Battle Vigor is active.
// green -> yellow (<=8s) -> red (<=4s); DOWN -> deep red + "NOT ENRAGED" + pulsing red glow.
const RAGE_BUFFS = ['Unbridled Rage', 'Onslaught', 'Battle Vigor'];   // any of these = a Rage phase
const ur = B.uptimeBar(GROUP_ID, { id: 'Barbarian Unbridled Rage', yOffset: UR_Y, width: BAR_W, height: UR_H,
  buff: RAGE_BUFFS, label: 'Enrage  %p', warnText: 'NOT ENRAGED', bg: [0.06, 0.05, 0.02, 0.85] });

// ---------- cooldown icons (shared B.cooldownIcon; glow color/style is explicit data) ----------
// glowReadyPower -> white Action Button Glow while ready AND Energy >= N (Crush).
// glowPowerPct   -> gold Action Button Glow while Energy% >= N (Decapitate worth casting).
// glowBuffMissing-> white Action Button Glow when a maintenance buff has dropped (recast now).
// glowBuff       -> Pixel class-color while a defensive/raid self-buff is active.
// showPowerAbove -> only shown once Energy >= N (Whirling Advance dash).
const mk = cfg => B.cooldownIcon({ ...cfg, id: 'Barbarian CD - ' + cfg.label });

// ---------- Featured: CRUSH (big, centered, glow when up) ----------
const crush = mk({ label: 'Crush', spell: 500915, parentId: GROUP_ID, size: ICON_FEAT,
  xOffset: 0, yOffset: FEAT_Y, glowReadyPower: 63, glowColor: WHITE_GLOW, glowType: 'buttonOverlay' });

// ---------- "CRY MISSING" warning text (top) ----------
// Brutal Shout is the keep-up shout. Instead of a small icon (confusing), show a big red text at the
// very top that appears ONLY while the buff is ABSENT — so you never forget to recast your cry.
// Built as a fully transparent aurabar used purely as a text carrier (no text-region template exists).
const TRACK_BUFF = 'Brutal Shout';   // tracked by name
const cryWarn = B.baseBar(GROUP_ID, 'Barbarian Warn - Cry');
cryWarn.yOffset = WARN_Y; cryWarn.width = 250; cryWarn.height = 22;
cryWarn.enableGradient = false;
cryWarn.barColor = [0, 0, 0, 0]; cryWarn.backgroundColor = [0, 0, 0, 0];   // invisible bar
cryWarn.triggers = B.wrap([B.T(B.buffTrigger(TRACK_BUFF, 'showAlways'))], 1);
cryWarn.progressSource = [-1, ''];
const warnLabel = cryWarn.subRegions.find(s => s.type === 'subtext');
warnLabel.text_text = 'CRY MISSING'; warnLabel.text_fontSize = 20; warnLabel.text_fontType = 'OUTLINE';
warnLabel.text_color = [1, 0.2, 0.15, 1]; warnLabel.anchor_point = 'INNER_CENTER'; warnLabel.text_visible = false;
const warnBorder = cryWarn.subRegions.find(s => s.type === 'subborder');
if (warnBorder) warnBorder.border_visible = false;
cryWarn.conditions = [
  // shown only when the buff is missing (buffed==0); reverts to hidden when it's up
  { check: { trigger: 1, variable: 'buffed', value: 0 }, changes: [{ property: 'sub.4.text_visible', value: true }] }
];

// ---------- Decapitate PROC (bottom) — execute window, target below 35% life ----------
// (targetExecuteTrigger lives in lib/builders.js — a custom stateupdate reading UnitHealth("target")
// directly, so the icon is active ONLY in the execute window.)
const proc = B.iconBase(GROUP_ID, {
  id: 'Barbarian Proc - Decapitate', parentId: GROUP_ID, size: ICON_PROC,
  fallbackIcon: 'Interface\\Icons\\Ability_Warrior_DecisiveStrike'
});
proc.xOffset = 0; proc.yOffset = PROC_Y; proc.iconSource = 2;   // use Decapitate (trigger 2) art
proc.cooldownTextDisabled = true;   // no stray "34m" cooldown number on the proc
proc.triggers = B.wrap([
  B.T(B.targetExecuteTrigger(35)),   // trigger 1 (controls show): target < 35% HP
  B.T(B.cooldownTrigger(804414))   // trigger 2: Decapitate art + cooldown
], 1);
// permanent white Action Button Glow — only renders while the icon is shown (execute window)
for (const sr of proc.subRegions) {
  if (sr.type === 'subglow') { sr.glow = true; sr.glowType = 'buttonOverlay'; sr.useGlowColor = true; sr.glowColor = WHITE_GLOW.slice(); }
}
proc.conditions = [
  { check: { trigger: 2, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }
];

// ---------- Middle spell row (horizontal, centered) ----------
const ICONS_SPELL = [
  { label: 'Whirling Advance', spell: 500919, showPowerAbove: 45 },   // dash: only shown at >=45 Energy
  { label: 'Decapitate', spell: 804414, glowPowerPct: 60, glowColor: GOLD_GLOW, glowType: 'buttonOverlay' },   // gold glow at >=60% Energy
  { label: 'Headbutt', spell: 520523 },
  { label: 'Kick', spell: 'Kick', byName: true, fallbackIcon: 'Interface\\Icons\\Ability_Kick' },
  { label: 'Jawbreaker', spell: 802792 }
];   // all rendered at ICON_SPELL -> Kick is the same size as the rest of the row
// ---------- Offensive column (RIGHT, vertical) : offensive CDs + Enrage effect ----------
const ICONS_OFF = [
  { label: 'Unbridled Rage', spell: 'Unbridled Rage', byName: true, glowBuffMissing: 'Unbridled Rage',
    glowColor: WHITE_GLOW, glowType: 'buttonOverlay',
    fallbackIcon: 'Interface\\Icons\\Ability_Warrior_InnerRage' },   // the Enrage effect
  { label: 'Storm of Steel', spell: 800637 },
  { label: 'Killing Spree', spell: 850021 },
  { label: 'Hodirs Wrath', spell: 800152 }
];
// ---------- Defensive column (LEFT, vertical) : Battle Vigor / Defiance / Thick Skull ----------
const DEF_GLOW = { glowColor: BARB_COLOR, glowType: 'Pixel' };   // Pixel class-color while the buff is up
const ICONS_DEF = [
  { label: 'Battle Vigor', spell: 801768, glowBuff: 'Battle Vigor', ...DEF_GLOW },
  { label: 'Defiance', spell: 806228, glowBuff: 'Defiance', ...DEF_GLOW },
  { label: 'Thick Skull', spell: 801549, glowBuff: 'Thick Skull', ...DEF_GLOW }
];

const spellIcons = ICONS_SPELL.map(c => mk({ ...c, parentId: SPELL_ID, size: ICON_SPELL }));
const offIcons = ICONS_OFF.map(c => mk({ ...c, parentId: CD_OFF_ID, size: ICON_CD }));
const defIcons = ICONS_DEF.map(c => mk({ ...c, parentId: CD_DEF_ID, size: ICON_CD }));

// ---------- dynamic groups ----------
// spell row = horizontal, centered
const spellGroup = B.makeDynGroup(GROUP_ID, SPELL_ID, spellIcons, { yOffset: SPELL_Y, perRow: spellIcons.length, iconSize: ICON_SPELL });
// def / off = vertical columns flanking the WA (override grow with a vertical layout)
const offGroup = B.makeColumn(GROUP_ID, CD_OFF_ID, offIcons, { xOffset: OFF_X, yOffset: OFF_Y, iconSize: ICON_CD });
const defGroup = B.makeColumn(GROUP_ID, CD_DEF_ID, defIcons, { xOffset: DEF_X, yOffset: DEF_Y, iconSize: ICON_CD });

const group = B.makeGroup(GROUP_ID, [
  cryWarn.id, crush.id, spellGroup.id, defGroup.id, offGroup.id,
  ur.id, rage.id, health.id, proc.id
]);

const children = [
  cryWarn, crush, proc, ur, rage, health,
  spellGroup, defGroup, offGroup,
  ...spellIcons, ...offIcons, ...defIcons
];

// combatOnly:true -> hide the entire package out of combat
module.exports = B.buildPackage({ name: 'barbarian-brutality', group, children, combatOnly: true });
