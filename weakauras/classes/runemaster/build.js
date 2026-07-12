// Runemaster — Runic. Layout top -> bottom:
//   [ primary cooldowns ]  Runeblade(3 orange segments = CHARGES)  Mana(blue)  Health(red)  [ secondary ]
// The 3 segments track RUNEBLADE CHARGES (0..3 — Runeblade is a charged spell). Runeblade's
// icon shows the charge count. When Runeblade is at 3 charges, PRIMORDIAL BLAST glows hard
// (Action Button Glow, orange) = dump now. Runic Brand icon glows hard (Action Button Glow,
// white) when the spell is UP (ready) — no debuff tracking. Power Overwhelming is a proc-only icon.
const B = require('../../lib/builders.js');

const GROUP_ID = 'Runemaster Runic';
const CD_GROUP_ID = 'Runic CDs (Primary)';
const CD2_GROUP_ID = 'Runic CDs (Secondary)';
const STRONG_GLOW = 'buttonOverlay';   // Blizzard Action Button Glow — the "very strong" cue François wants

// --- colors ---
const MANA_HI = [0.30, 0.55, 1.00, 1], MANA_LO = [0.05, 0.12, 0.45, 1];
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];
const ORANGE_GLOW = [1.00, 0.45, 0.05, 1];  // fire-orange cue (Primordial Blast @ 3 Runeblade stacks)
const WHITE_GLOW = [1, 1, 1, 1];            // "use this now" cue (Runic Brand ready, Power Overwhelming)
const RUNE_HI = [1.00, 0.58, 0.12, 1], RUNE_LO = [0.55, 0.20, 0.00, 1];  // Runeblade segment fill
const RUNE_EMPTY = [0.12, 0.07, 0.02, 0.9];

// --- geometry (compact: everything within a 250px width, tight vertical gaps) ---
const BAR_W = 250;
const MANA_H = 14, HEALTH_H = 14, SEG_H = 12;
const ICON_SIZE = 26, ICON_SIZE_2 = 24;
const CD_Y = -140, SEG_Y = -162, MANA_Y = -178, HEALTH_Y = -195, CD2_Y = -218;

// Runeblade is a charged spell (up to 3 charges); spend at 3 charges with Primordial Blast.
// (baseline ability, tracked by name — confirm it resolves in-game / adjust the charge count.)
const RUNEBLADE_SPELL = 'Runeblade';
const RUNEBLADE_MAX = 3;

// ---------- Mana bar ----------
const mana = B.baseBar(GROUP_ID, 'Runic Mana');
mana.yOffset = MANA_Y; mana.width = BAR_W; mana.height = MANA_H;
B.gradient(mana, MANA_HI, MANA_LO);
mana.backgroundColor = [0.03, 0.05, 0.14, 0.85];
mana.triggers = B.wrap([B.T(B.powerTrigger(0))], -10);   // 0 = Mana
B.barText(mana, '%p', 11);

// ---------- Health bar ----------
const health = B.baseBar(GROUP_ID, 'Runic Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
B.gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = B.wrap([B.T(B.healthTrigger('player'))], -10);
B.barText(health, '%p', 11);

// ---------- Runeblade 3-segment bar (spell charges 0..3) ----------
const SEG_GAP = 6;
const SEG_W = (BAR_W - (RUNEBLADE_MAX - 1) * SEG_GAP) / RUNEBLADE_MAX;
const segStartX = -BAR_W / 2 + SEG_W / 2;
const runebladeBoxes = [];
for (let i = 1; i <= RUNEBLADE_MAX; i++) {
  runebladeBoxes.push(B.chargeSegmentBar(GROUP_ID, {
    id: 'Runic Runeblade Seg ' + i, index: i,
    spell: RUNEBLADE_SPELL, byName: true,
    hiColor: RUNE_HI, loColor: RUNE_LO, emptyBg: RUNE_EMPTY,
    width: SEG_W, height: SEG_H, xOffset: segStartX + (i - 1) * (SEG_W + SEG_GAP), yOffset: SEG_Y
  }));
}

// ---------- cooldown icons ----------
function makeIcon(cfg, parentId, size) {
  const b = B.iconBase(GROUP_ID, { id: 'Runic - ' + cfg.label, parentId, size, fallbackIcon: cfg.fallbackIcon });
  let triggerArr, conditions;

  if (cfg.proc) {
    // proc-only icon: appears + glows (Action Button Glow, white) only while the self buff is active
    triggerArr = [B.T(B.buffTrigger(cfg.proc))];
    conditions = [{ check: { trigger: 1, variable: 'show', value: 1 }, changes: B.glowChanges(cfg.glowColor || WHITE_GLOW, cfg.glowType || STRONG_GLOW) }];
  } else {
    triggerArr = [B.T(B.cooldownTrigger(cfg.spell, cfg.byName))];
    conditions = [{ check: { trigger: 1, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }];

    if (cfg.glowWhenReady) {
      // strong Action Button Glow while the spell is UP (off cooldown / ready to cast)
      conditions.push({ check: { trigger: 1, variable: 'onCooldown', value: 0 }, changes: B.glowChanges(cfg.glowColor || WHITE_GLOW, cfg.glowType || STRONG_GLOW) });
    }
    if (cfg.glowOnCharges) {
      // glow hard based on a (charged) spell's charge count — Primordial Blast lights up when
      // Runeblade's charges are exhausted (charges == 0)
      const g = cfg.glowOnCharges;
      triggerArr.push(B.T(B.cooldownTrigger(g.spell, g.byName)));
      conditions.push({ check: { op: g.op || '>=', trigger: triggerArr.length, variable: 'charges', value: String(g.value) }, changes: B.glowChanges(g.color || ORANGE_GLOW, g.glowType || STRONG_GLOW) });
    }
  }

  b.triggers = B.wrap(triggerArr, 1);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), B.chargesSubtext()]; }
  return b;
}

const ICONS_MAIN = [
  { label: 'Runic Brand', spell: 712299, glowWhenReady: true },                       // strong white glow when UP
  { label: 'Runeblade', spell: RUNEBLADE_SPELL, byName: true, charges: true,           // shows charge count (0..3)
    fallbackIcon: 'Interface\\Icons\\INV_Sword_48' },
  { label: 'Zenith', spell: 712325 },
  { label: 'Primordial Blast', spell: 'Primordial Blast', byName: true,                // glows hard when Runeblade charges are spent (0)
    glowOnCharges: { spell: RUNEBLADE_SPELL, byName: true, op: '==', value: 0, color: ORANGE_GLOW },
    fallbackIcon: 'Interface\\Icons\\Spell_Fire_Fireball02' },
  { label: 'Fist of the Ancients', spell: 712326 },
  { label: 'Power Overwhelming', proc: 'Power Overwhelming', fallbackIcon: 'Interface\\Icons\\Spell_Shadow_UnholyFrenzy' }
];
const ICONS_SECONDARY = [
  { label: 'Guarding Rune', spell: 500464 },
  { label: 'Granite Resolve', spell: 520229 }
];

const mainIcons = ICONS_MAIN.map(c => makeIcon(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => makeIcon(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });

const group = B.makeGroup(GROUP_ID, [cdGroup.id, ...runebladeBoxes.map(b => b.id), mana.id, health.id, cd2Group.id]);
const children = [mana, health, ...runebladeBoxes, cdGroup, cd2Group, ...mainIcons, ...secIcons];

module.exports = B.buildPackage({ name: 'runemaster', group, children });
