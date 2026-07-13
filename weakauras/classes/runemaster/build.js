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
const CD_Y = -140, SEG_Y = -162, MANA_Y = -178, HEALTH_Y = -195;
const BUFF_Y = -219;    // weapon-engraving + tattoo buff row (directly under HP)
const CD2_Y = -248;     // secondary CD row (shifted down to make room for the buff row)

// Runeblade is a charged spell (up to 3 charges); spend at 3 charges with Primordial Blast.
// Baseline spellId resolved from db.ascension.gg (coa-baselines): @Runeblade rank 1 = 707141 (learned
// lvl 1, so always known). Ranked spell (7 ranks) — cooldown/charges are shared across ranks, so the
// rank-1 id tracks fine; if in-game charge tracking is off at max level, fall back to byName 'Runeblade'.
const RUNEBLADE_SPELL = 707141;
const RUNEBLADE_BYNAME = false;
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
    spell: RUNEBLADE_SPELL, byName: RUNEBLADE_BYNAME,
    hiColor: RUNE_HI, loColor: RUNE_LO, emptyBg: RUNE_EMPTY,
    width: SEG_W, height: SEG_H, xOffset: segStartX + (i - 1) * (SEG_W + SEG_GAP), yOffset: SEG_Y
  }));
}

// ---------- cooldown icons (shared B.cooldownIcon; glow color/style is explicit data) ----------
// glowReady -> strong white Action Button Glow while the spell is off cooldown (ready to cast).
// glowOnCharges -> glow hard by another spell's charge count (Primordial Blast @ 0 Runeblade charges).
// proc -> proc-only icon: appears + glows only while the self buff is active.
const mk = (cfg, parentId, size) => B.cooldownIcon({ ...cfg, id: 'Runic - ' + cfg.label, parentId, size });
const READY_GLOW = { glowColor: WHITE_GLOW, glowType: STRONG_GLOW };

const ICONS_MAIN = [
  { label: 'Runic Brand', spell: 712299, glowReady: true, ...READY_GLOW },             // strong white glow when UP
  { label: 'Runeblade', spell: RUNEBLADE_SPELL, byName: RUNEBLADE_BYNAME, charges: true, // shows charge count (0..3)
    fallbackIcon: 'Interface\\Icons\\INV_Sword_48' },
  { label: 'Zenith', spell: 712325 },
  { label: 'Primordial Blast', spell: 800732,                                          // baseline id (was by-name); glows hard when Runeblade charges are spent (0)
    glowOnCharges: { spell: RUNEBLADE_SPELL, byName: RUNEBLADE_BYNAME, op: '==', value: 0, color: ORANGE_GLOW },
    fallbackIcon: 'Interface\\Icons\\Spell_Fire_Fireball02' },
  { label: 'Fist of the Ancients', spell: 712326 },
  { label: 'Power Overwhelming', proc: 'Power Overwhelming', ...READY_GLOW, fallbackIcon: 'Interface\\Icons\\Spell_Shadow_UnholyFrenzy' }
];
const ICONS_SECONDARY = [
  { label: 'Guarding Rune', spell: 500464 },
  { label: 'Granite Resolve', spell: 520229 }
];

const mainIcons = ICONS_MAIN.map(c => mk(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => mk(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- weapon-engraving + tattoo buff row (under HP) ----------
// Francois: "affiche celui que j'ai" — show the currently-active Runic Tattoo (self buff) and the
// currently-active Weapon Engravings (temporary weapon enchants, MH + OH). All three are showOnActive
// icons in a centered dynamicgroup, so only the active ones appear and the row re-centers.
//   - Tattoo: aura2 matches the elemental tattoo buffs by name; iconSource -1 shows the real elemental
//     buff icon of whichever is up (+ swipe timer if the buff has a duration).
//   - Engraving MH/OH: the "Weapon Enchant" trigger (WA reads GetWeaponEnchantInfo + scans the weapon
//     tooltip). enchant "" = match any engraving. MVP look: the WEAPON'S icon (that's all the trigger
//     exposes) + the enchant name as a subtext (%n, e.g. "Earth Engraving") + the temp-enchant timer.
const BUFF_GROUP_ID = 'Runic Weapon/Tattoo Buffs';
const BUFF_SIZE = 26;
// Full elemental set enumerated from db.ascension.gg (@Runic Tattoos: <element>). Detection is by buff
// NAME via aura2 (spellId not needed); the '@' is the DB's custom-marker, not part of the in-game name.
const TATTOO_NAMES = [
  'Runic Tattoos: Fire', 'Runic Tattoos: Water', 'Runic Tattoos: Air',
  'Runic Tattoos: Earth', 'Runic Tattoos: Frost', 'Runic Tattoos: Arcane'
];

function tattooAura() {
  return {
    type: 'aura2', unit: 'player', debuffType: 'HELPFUL', useName: true,
    auranames: TATTOO_NAMES.slice(), names: [], spellIds: [], auraspellids: [],
    matchesShowOn: 'showOnActive', ownOnly: true, unitExists: true,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
function weaponEnchantTrigger(weapon) {   // weapon: 'main' | 'off'
  return {
    type: 'item', event: 'Weapon Enchant', weapon,
    use_enchant: false, enchant: '', showOn: 'showOnActive',
    use_stacks: false, use_remaining: false,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}
// Francois: the full engraving name ("Fire Engraving") is ugly — show only a short letter (F, E, W, ...).
// There is NO "Custom" string-format type (verified in weakauras2 Types.lua: format_types.string only
// truncates via _abbreviate, which would collide Fire/Frost->F and Air/Arcane->A). Instead we use the
// custom-text %c placeholder: a subtext of "%c" invokes the PARENT icon's `customText` Lua function, which
// WeakAuras calls as f(expirationTime, duration, progress, dur, name, icon, stacks) (see WeakAuras.lua
// Private.RunCustomTextFunc). We read arg 5 (`name` = the weapon-enchant name) and map it to a letter;
// Fire/Frost and Air/Arcane get a 2-char tag (Fr / Ar) to stay unambiguous. ASCII only (codec round-trip).
const ENGRAVING_LETTER_FN = [
  'function(expirationTime, duration, progress, dur, name, icon, stacks)',
  '  if not name then return "" end',
  '  name = string.lower(name)',
  '  if string.find(name, "frost") then return "Fr" end',
  '  if string.find(name, "fire") then return "F" end',
  '  if string.find(name, "arcane") then return "Ar" end',
  '  if string.find(name, "air") then return "A" end',
  '  if string.find(name, "water") then return "W" end',
  '  if string.find(name, "earth") then return "E" end',
  '  return string.upper(string.sub(name, 1, 1))',
  'end'
].join('\n');

function nameSubtext() {   // shows a short letter for the matched engraving element (F, E, W, ...) via %c
  return {
    type: 'subtext', text_text: '%c', text_visible: true, text_color: [1, 1, 1, 1],
    text_font: 'Friz Quadrata TT', text_fontSize: 12, text_fontType: 'OUTLINE',
    anchor_point: 'INNER_BOTTOM', text_selfPoint: 'AUTO', anchorXOffset: 0, anchorYOffset: -1,
    text_shadowColor: [0, 0, 0, 1], text_shadowXOffset: 1, text_shadowYOffset: -1,
    text_justify: 'CENTER', rotateText: 'NONE', text_wordWrap: 'WordWrap',
    text_automaticWidth: 'Auto', text_fixedWidth: 64, text_text_format_c_format: 'none'
  };
}
// Attach the letter-mapping custom-text function to an engraving icon (drives its "%c" subtext).
function withEngravingLetter(icon) {
  icon.customText = ENGRAVING_LETTER_FN;
  icon.customTextUpdate = 'event';   // recompute on trigger-state change (enchant swap), not every frame
  icon.subRegions = [...(icon.subRegions || []), nameSubtext()];
  return icon;
}

const tattooIcon = B.iconBase(GROUP_ID, {
  id: 'Runic - Tattoo', parentId: BUFF_GROUP_ID, size: BUFF_SIZE,
  fallbackIcon: 'Interface\\Icons\\Spell_Shadow_DeathPact'
});
tattooIcon.triggers = B.wrap([B.T(tattooAura())], 1);
tattooIcon.conditions = [];

const engMH = B.iconBase(GROUP_ID, {
  id: 'Runic - Engraving MH', parentId: BUFF_GROUP_ID, size: BUFF_SIZE,
  fallbackIcon: 'Interface\\Icons\\INV_Sword_48'
});
engMH.triggers = B.wrap([B.T(weaponEnchantTrigger('main'))], 1);
engMH.conditions = [];
withEngravingLetter(engMH);

const engOH = B.iconBase(GROUP_ID, {
  id: 'Runic - Engraving OH', parentId: BUFF_GROUP_ID, size: BUFF_SIZE,
  fallbackIcon: 'Interface\\Icons\\INV_Sword_48'
});
engOH.triggers = B.wrap([B.T(weaponEnchantTrigger('off'))], 1);
engOH.conditions = [];
withEngravingLetter(engOH);

// ---------- Water tattoo reminder (always visible; glows hard at low mana) ----------
// Francois: keep the Water tattoo visible at all times and make it glow when I drop to 25% mana. Water
// regens mana, but running it permanently costs the movespeed / crit tattoos, so it's a "swap NOW" cue.
// Recipe = "buff indicator (self)" element: aura2 (showAlways) so the icon is always shown and exposes
// `buffed`; when NOT on Water -> desaturate + dim (passive reminder); low mana -> Action Button Glow (blue).
const WATER_TATTOO_NAME = 'Runic Tattoos: Water';
const WATER_ICON = 'Interface\\Icons\\70_inscription_vantus_rune_azure';  // the Runic Tattoos azure rune (blue)
const WATER_GLOW = [0.30, 0.70, 1.00, 1];   // water blue "swap now" cue
const LOW_MANA_PCT = 25;

const waterReminder = B.iconBase(GROUP_ID, {
  id: 'Runic - Water Tattoo Reminder', parentId: BUFF_GROUP_ID, size: BUFF_SIZE, fallbackIcon: WATER_ICON
});
waterReminder.triggers = B.wrap([
  B.T(B.buffTrigger(WATER_TATTOO_NAME, 'showAlways')),   // trigger 1 (main): always shown; `buffed` + real icon when active
  B.T(B.powerTrigger(0))                                 // trigger 2: Mana -> `percentpower`
], 1);
waterReminder.conditions = [
  // not currently on the Water tattoo -> dim, desaturated reminder
  { check: { trigger: 1, variable: 'buffed', value: 0 },
    changes: [{ property: 'desaturate', value: true }, { property: 'alpha', value: 0.5 }] },
  // low on mana -> swap to Water now: strong Action Button Glow, blue
  { check: { trigger: 2, variable: 'percentpower', op: '<=', value: String(LOW_MANA_PCT) },
    changes: B.glowChanges(WATER_GLOW, STRONG_GLOW) }
];

const buffIcons = [tattooIcon, waterReminder, engMH, engOH];

// ---------- dynamic groups + root ----------
const cdGroup = B.makeDynGroup(GROUP_ID, CD_GROUP_ID, mainIcons, { yOffset: CD_Y, maxWidth: BAR_W, iconSize: ICON_SIZE });
const cd2Group = B.makeDynGroup(GROUP_ID, CD2_GROUP_ID, secIcons, { yOffset: CD2_Y, maxWidth: BAR_W, iconSize: ICON_SIZE_2 });
const buffGroup = B.makeDynGroup(GROUP_ID, BUFF_GROUP_ID, buffIcons, { yOffset: BUFF_Y, maxWidth: BAR_W, iconSize: BUFF_SIZE });

const group = B.makeGroup(GROUP_ID, [cdGroup.id, ...runebladeBoxes.map(b => b.id), mana.id, health.id, buffGroup.id, cd2Group.id]);
const children = [mana, health, ...runebladeBoxes, cdGroup, cd2Group, buffGroup, ...mainIcons, ...secIcons, ...buffIcons];

module.exports = B.buildPackage({ name: 'runemaster', group, children });
