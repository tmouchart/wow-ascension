// Tinker — Demolition (ranged fire DPS). Resource = MANA only. Layout top -> bottom:
//   [ primary cooldowns ]  Mana(blue)  Health(red)  [ secondary cooldowns ]
// Glow taxonomy: Action Button Glow (buttonOverlay, white) when a big cooldown is READY;
// Pixel class-color when a defensive self-buff (Kinetic Shield) is UP.
const B = require('../../lib/builders.js');

const GROUP_ID = 'Tinker Demolition';
const CD_GROUP_ID = 'Tinker CDs (Primary)';
const CD2_GROUP_ID = 'Tinker CDs (Secondary)';
const STRONG_GLOW = 'buttonOverlay';   // Blizzard Action Button Glow — the "act now" cue

// --- colors ---
const MANA_HI = [0.30, 0.55, 1.00, 1], MANA_LO = [0.05, 0.12, 0.45, 1];
const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];
const WHITE_GLOW = [1, 1, 1, 1];                   // "use this now" cue (spell ready)
const TINKER_COPPER = [0.95, 0.58, 0.12, 1];       // class-ish color (defensive buff up, Pixel)

// --- geometry (compact: everything within a 250px width, tight vertical gaps) ---
const BAR_W = 250;
const MANA_H = 14, HEALTH_H = 14;
const ICON_SIZE = 26, ICON_SIZE_2 = 24;
const CD_Y = -150, MANA_Y = -172, HEALTH_Y = -189, CD2_Y = -212;

// ---------- Mana bar ----------
const mana = B.baseBar(GROUP_ID, 'Tinker Mana');
mana.yOffset = MANA_Y; mana.width = BAR_W; mana.height = MANA_H;
B.gradient(mana, MANA_HI, MANA_LO);
mana.backgroundColor = [0.03, 0.05, 0.14, 0.85];
mana.triggers = B.wrap([B.T(B.powerTrigger(0))], -10);   // 0 = Mana
B.barText(mana, '%p', 11);

// ---------- Health bar ----------
const health = B.baseBar(GROUP_ID, 'Tinker Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
B.gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = B.wrap([B.T(B.healthTrigger('player'))], -10);
B.barText(health, '%p', 11);

// ---------- cooldown icons ----------
function makeIcon(cfg, parentId, size) {
  const b = B.iconBase(GROUP_ID, { id: 'Tinker - ' + cfg.label, parentId, size, fallbackIcon: cfg.fallbackIcon });
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
    if (cfg.glowBuff) {
      // Pixel class-color glow while the defensive self-buff it grants is active
      triggerArr.push(B.T(B.buffTrigger(cfg.glowBuff)));
      conditions.push({ check: { trigger: triggerArr.length, variable: 'show', value: 1 }, changes: B.glowChanges(cfg.glowColor || TINKER_COPPER, cfg.glowType || 'Pixel') });
    }
  }

  b.triggers = B.wrap(triggerArr, 1);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), B.chargesSubtext()]; }
  return b;
}

// Demolition core offensive kit (castable spellIds from tools/coa-classes/tinker/tinker-abilities.md).
const ICONS_MAIN = [
  { label: 'Bomb Toss', spell: 801005 },                                            // armor-shred fire hit
  { label: 'Rocket Launcher', spell: 500235 },                                      // hard direct hit
  { label: 'Firepot Drone', spell: 500600, charges: true,                           // 3 charges, 10s recharge
    fallbackIcon: 'Interface\\Icons\\INV_Misc_Bomb_08' },
  { label: 'Spider Bomb', spell: 500535 },
  { label: 'Hyperblast Barrage', spell: 500249, glowWhenReady: true },              // white glow when READY (big cd)
  { label: 'Rockadier', spell: 801827, glowWhenReady: true },                       // white glow when READY (empower)
  { label: 'Rocket Barrage', spell: 805314 },
  { label: 'Spider Bomb Factory', spell: 802052 }
];
// Class-tree defensives / utility.
const ICONS_SECONDARY = [
  { label: 'Kinetic Shield', spell: 806224, glowBuff: 'Kinetic Shield' },           // Pixel copper while shield is up
  { label: 'Med Pack', spell: 800347, fallbackIcon: 'Interface\\Icons\\INV_Misc_Bandage_15' },
  { label: 'Rocket Boots', spell: 500241, charges: true,                            // 3 charges mobility
    fallbackIcon: 'Interface\\Icons\\Ability_Rogue_Sprint' },
  { label: 'Air Strike', spell: 801744 }
];

const mainIcons = ICONS_MAIN.map(c => makeIcon(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => makeIcon(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });

const group = B.makeGroup(GROUP_ID, [cdGroup.id, mana.id, health.id, cd2Group.id]);
const children = [mana, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];

module.exports = B.buildPackage({ name: 'tinker', group, children });
