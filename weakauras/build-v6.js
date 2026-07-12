// Felsworn Tyrant WeakAura v6: gradient bars (Energy gold / Felfury green / Health red),
// a main cooldown icon row AND a secondary cooldown row below the health bar.
// Glows: green on defensive self-buffs, gold on Fel Fireball & on Tyrant's Gaze when the
// current target drops below 35% health.
const fs = require('fs');
const { encodeWA, decodeWA } = require('./wa-codec.js');

const barTpl = JSON.parse(fs.readFileSync('_template-bar.json', 'utf8'));
const iconTpl = JSON.parse(fs.readFileSync('_template-icon.json', 'utf8'));
const grpTpl = JSON.parse(fs.readFileSync('_template-group.json', 'utf8'));
const dgTpl = JSON.parse(fs.readFileSync('_template-dyngroup.json', 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

// Deterministic uid from an id. WeakAuras matches import->installed auras by `uid`; keeping it
// stable across builds is what makes an import say "Update" instead of creating a new aura set.
// Derived from the (stable) id, so uids only change if we rename an element.
function uidFor(seed) {
  let h1 = 0x811c9dc5, h2 = (0x811c9dc5 ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  const CS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let n = (BigInt(h1) << 32n) | BigInt(h2), s = '';
  for (let i = 0; i < 11; i++) { s += CS[Number(n % 61n)]; n /= 61n; }
  return s;
}

const GROUP_ID = 'Felsworn Tyrant';
const CD_GROUP_ID = 'Felsworn CDs';
const CD2_GROUP_ID = 'Felsworn CDs (Secondary)';
const FELSWORN_GREEN = [0.337, 0.729, 0.016, 1];
const WHITE_GLOW = [1, 1, 1, 1];
const GOLD_GLOW = [1, 0.82, 0.10, 1];
const EMPTY_BG = [0.09, 0.11, 0.09, 0.9];
const MAX_FELFURY = 6;
const ICON_SIZE = 30;
const ICON_SIZE_2 = 26;

// --- gradient palettes (barColor -> barColor2) ---
const GOLD_HI = [1, 0.88, 0.15, 1];      // energy bright
const GOLD_LO = [0.72, 0.42, 0.0, 1];    // energy dark
const FEL_HI = [0.45, 0.90, 0.06, 1];    // felfury bright green
const FEL_LO = [0.10, 0.32, 0.0, 1];     // felfury dark green
const HP_HI = [0.90, 0.16, 0.12, 1];     // health bright red
const HP_LO = [0.33, 0.02, 0.02, 1];     // health dark red

// --- bar geometry ---
const BAR_W = 300;
const ENERGY_H = 14, FELFURY_H = 12, HEALTH_H = 14;
const ENERGY_Y = -180, FELFURY_Y = -198, HEALTH_Y = -216;
const CD_Y = -140;        // main cooldown row (above the bars)
const CD2_Y = -248;       // secondary cooldown row (below the health bar)

const loadAlways = () => ({
  use_never: false, size: { multi: [] }, talent: { multi: [] },
  spec: { multi: [] }, class: { multi: [] }, zoneIds: '', role: [], use_petbattle: false, pvptalent: []
});
const safeActions = () => ({
  start: { do_message: false, do_custom: false },
  init: { do_custom: false },
  finish: { do_message: false, do_custom: false }
});
const stripMeta = (o) => { delete o.wagoID; delete o.url; delete o.source; delete o.semver; };
const wrap = (triggerArr, activeTriggerMode) => ({ __array: triggerArr, disjunctive: 'any', activeTriggerMode });
const T = (trigger) => ({ untrigger: [], trigger });

// ---------- generic bar ----------
function baseBar(id) {
  const b = clone(barTpl);
  b.id = id; b.uid = uidFor(id); b.parent = GROUP_ID;
  b.load = loadAlways(); b.actions = safeActions(); b.conditions = [];
  stripMeta(b);
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = 0; b.yOffset = 0; b.isPrimaryResource = false;
  b.config = []; b.authorOptions = []; b.configGroup = '';
  b.useAdjustededMax = false; b.adjustedMax = ''; b.useAdjustededMin = false; b.adjustedMin = '';
  b.progressSource = [-1, ''];
  return b;
}
function barText(b, txt, size) {
  for (const sr of (b.subRegions || [])) {
    if (sr.type === 'subtext') { sr.text_text = txt; sr.text_fontSize = size || 12; sr.text_visible = txt !== ''; }
    if (sr.type === 'subborder') { sr.border_visible = true; sr.border_color = [0, 0, 0, 0.9]; sr.border_size = 1; }
  }
}
function gradient(b, hi, lo) {
  b.enableGradient = true;
  b.gradientOrientation = 'HORIZONTAL';
  b.barColor = hi.slice();
  b.barColor2 = lo.slice();
}

// ---------- Energy bar ----------
const energy = baseBar('Felsworn Energy');
energy.yOffset = ENERGY_Y; energy.width = BAR_W; energy.height = ENERGY_H;
gradient(energy, GOLD_HI, GOLD_LO);
energy.backgroundColor = [0.12, 0.1, 0.0, 0.8];
energy.triggers = wrap([T({
  use_unit: true, duration: '1', use_powertype: true, use_absorbMode: true,
  unevent: 'auto', powertype: 3, unit: 'player', type: 'unit', event: 'Power',
  subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
})], -10);
barText(energy, '%p', 11);

// ---------- Felfury boxes ----------
const alwaysFullLua = `function(allstates, event, ...)
    allstates[""] = { show = true, changed = true, progressType = "static", value = 1, total = 1 }
    return true
end`;
const BOX_W = 44, PITCH = 50;
const startX = -((MAX_FELFURY - 1) * PITCH) / 2;
const felBoxes = [];
for (let i = 1; i <= MAX_FELFURY; i++) {
  const b = baseBar('Felsworn Felfury ' + i);
  b.width = BOX_W; b.height = FELFURY_H; b.xOffset = startX + (i - 1) * PITCH; b.yOffset = FELFURY_Y;
  b.enableGradient = false; b.gradientOrientation = 'HORIZONTAL';
  b.barColor = [0, 0, 0, 0]; b.barColor2 = [0, 0, 0, 0]; b.backgroundColor = EMPTY_BG; b.smoothProgress = false;
  b.triggers = wrap([
    T({ type: 'aura2', unit: 'player', debuffType: 'HELPFUL', useName: true, auranames: ['Felfury'],
        names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
        unitExists: true, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health' }),
    T({ type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
        events: 'PLAYER_ENTERING_WORLD, OPTIONS', custom: alwaysFullLua, unit: 'player',
        debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: [] })
  ], 2);
  b.conditions = [{
    check: { op: '>=', trigger: 1, variable: 'stacks', value: String(i) },
    changes: [
      { property: 'enableGradient', value: true },
      { property: 'barColor', value: FEL_HI.slice() },
      { property: 'barColor2', value: FEL_LO.slice() }
    ]
  }];
  barText(b, '', 10);
  felBoxes.push(b);
}

// ---------- Health bar ----------
const health = baseBar('Felsworn Health');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = wrap([T({
  use_unit: true, use_absorbMode: true, unevent: 'auto', unit: 'player',
  type: 'unit', event: 'Health', use_healthpct: false,
  subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
})], -10);
barText(health, '%p', 11);

// ---------- Cooldown icon triggers ----------
function cooldownTrigger(spell, byName) {
  return {
    type: 'spell', event: 'Cooldown Progress (Spell)',
    use_genericShowOn: true, genericShowOn: 'showAlways',
    use_track: true, track: 'auto', use_unit: true, unit: 'player',
    use_spellName: true, spellName: spell, realSpellName: spell,
    use_exact_spellName: !byName, useName: true,
    names: [], spellIds: [], debuffType: 'HELPFUL',
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START'
  };
}
function buffTrigger(name) {
  return {
    type: 'aura2', unit: 'player', debuffType: 'HELPFUL', useName: true, auranames: [name],
    names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showOnActive', ownOnly: true,
    unitExists: true, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
function targetHealthTrigger() {
  return {
    type: 'unit', event: 'Health', use_unit: true, unit: 'target', use_absorbMode: true,
    unevent: 'auto', use_percenthealth: false, unitExists: false,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}
function chargesSubtext() {
  return {
    type: 'subtext', text_text: '%s', text_visible: true, text_color: [1, 1, 1, 1],
    text_font: 'Friz Quadrata TT', text_fontSize: 12, text_fontType: 'OUTLINE',
    anchor_point: 'INNER_BOTTOMRIGHT', text_selfPoint: 'AUTO', anchorXOffset: 0, anchorYOffset: 0,
    text_shadowColor: [0, 0, 0, 1], text_shadowXOffset: 1, text_shadowYOffset: -1,
    text_justify: 'RIGHT', rotateText: 'NONE', text_wordWrap: 'WordWrap',
    text_automaticWidth: 'Auto', text_fixedWidth: 64, text_text_format_s_format: 'none'
  };
}
function glowChanges(color) {
  // "Action Button Glow" (Blizzard proc overlay) = glowType 'buttonOverlay', tintable via glowColor.
  return [
    { property: 'sub.3.glow', value: true },
    { property: 'sub.3.glowType', value: 'buttonOverlay' },
    { property: 'sub.3.useGlowColor', value: true },
    { property: 'sub.3.glowColor', value: color.slice() }
  ];
}

// ---------- Cooldown icon factory ----------
function makeIcon(cfg, parentId, size) {
  const b = clone(iconTpl);
  b.id = 'Felsworn CD - ' + cfg.label;
  b.uid = uidFor(b.id);
  b.parent = parentId;
  b.load = loadAlways(); b.actions = safeActions();
  stripMeta(b);
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = 0; b.yOffset = 0;
  b.width = size; b.height = size;
  b.auto = true; b.iconSource = -1; b.displayIcon = cfg.fallbackIcon || '';
  b.cooldown = true; b.cooldownSwipe = true; b.cooldownTextDisabled = false; b.cooldownEdge = false;
  b.desaturate = false; b.color = [1, 1, 1, 1];
  b.config = []; b.authorOptions = []; b.information = {};
  for (const sr of (b.subRegions || [])) { if (sr.type === 'subglow') { sr.glow = false; } }

  const triggerArr = [T(cooldownTrigger(cfg.spell, cfg.byName))];
  const conditions = [
    { check: { trigger: 1, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }
  ];
  const glowColor = cfg.glowColor || WHITE_GLOW;
  if (cfg.glowBuff) {
    triggerArr.push(T(buffTrigger(cfg.glowBuff)));
    conditions.push({ check: { trigger: 2, variable: 'show', value: 1 }, changes: glowChanges(glowColor) });
  } else if (cfg.glowTargetHealthBelow) {
    triggerArr.push(T(targetHealthTrigger()));
    conditions.push({
      check: { trigger: 2, variable: 'percenthealth', op: '<', value: String(cfg.glowTargetHealthBelow) },
      changes: glowChanges(glowColor)
    });
  }
  b.triggers = wrap(triggerArr, 1);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), chargesSubtext()]; }
  return b;
}

// ---------- Cooldown lists ----------
const ICONS_MAIN = [
  { label: 'Hateforged Barrier', spell: 705129, glowBuff: 'Hateforged Barrier' },
  { label: 'Demonic Will', spell: 800209, glowBuff: 'Demonic Will' },
  { label: 'Skull of Guldan', spell: 800225 },
  { label: 'Annihilation', spell: 803904 },
  { label: 'Tyrants Gaze', spell: 805240, glowTargetHealthBelow: 35, glowColor: GOLD_GLOW },
  { label: 'Reckoning', spell: 802058 },
  { label: 'Whispers of the Pit', spell: 805235 },
  { label: 'Chaos Rush', spell: 'Chaos Rush', byName: true, charges: true },
  { label: 'Fel Fireball', spell: 'Fel Fireball', byName: true, glowBuff: 'Carve', glowColor: GOLD_GLOW,
    fallbackIcon: 'Interface\\Icons\\Spell_Fire_FelFireBolt' }
];

const ICONS_SECONDARY = [
  // "brûlure de mana" = Manaburn (moved here from the main row)
  { label: 'Manaburn', spell: 805248 },
  // Not in the talent scrape -> track by name + fallback icon (cooldown swipe needs a resolvable spell)
  { label: 'Fel Bargain', spell: 'Fel Bargain', byName: true,
    fallbackIcon: 'Interface\\Icons\\Spell_Shadow_DemonicPact' },
  { label: 'Arcane Torrent', spell: 'Arcane Torrent', byName: true,
    fallbackIcon: 'Interface\\Icons\\Spell_Shadow_Teleport' }
];

const mainIcons = ICONS_MAIN.map(c => makeIcon(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => makeIcon(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- Cooldown dynamicgroup factory (centered, wrapping row) ----------
function customGrowLua(perRow, iconSize) {
  return `function(newPositions, activeRegions)
    local perRow = ${perRow}
    local w, h = ${iconSize}, ${iconSize}
    local hSpace, vSpace = 4, 4
    local n = #activeRegions
    local i = 1
    while i <= n do
        local rowCount = perRow
        if n - i + 1 < perRow then rowCount = n - i + 1 end
        local totalW = rowCount * w + (rowCount - 1) * hSpace
        local startX = -totalW / 2 + w / 2
        local row = math.floor((i - 1) / perRow)
        for k = 0, rowCount - 1 do
            newPositions[i + k] = { startX + k * (w + hSpace), row * (h + vSpace) }
        end
        i = i + rowCount
    end
end`;
}
function makeDynGroup(id, children, yOffset, perRow, iconSize) {
  const dg = clone(dgTpl);
  dg.id = id; dg.uid = uidFor(id); dg.parent = GROUP_ID;
  dg.load = loadAlways(); dg.actions = safeActions(); dg.conditions = [];
  stripMeta(dg);
  dg.controlledChildren = children.map(r => r.id);
  dg.grow = 'CUSTOM';
  dg.customGrow = customGrowLua(perRow, iconSize);
  dg.align = 'CENTER';
  dg.space = 4; dg.stagger = 0; dg.sort = 'none';
  dg.useLimit = false;
  dg.anchorFrameType = 'SCREEN'; dg.anchorPoint = 'CENTER'; dg.selfPoint = 'CENTER';
  dg.xOffset = 0; dg.yOffset = yOffset;
  dg.border = false;
  dg.triggers = wrap([T({
    type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
    events: 'PLAYER_ENTERING_WORLD, OPTIONS',
    custom: 'function(allstates, event, ...)\n    allstates[""] = { show = true, changed = true }\n    return true\nend',
    unit: 'player', debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  })], -10);
  return dg;
}

const cdGroup = makeDynGroup(CD_GROUP_ID, mainIcons, CD_Y, ICONS_MAIN.length, ICON_SIZE);
const cd2Group = makeDynGroup(CD2_GROUP_ID, secIcons, CD2_Y, ICONS_SECONDARY.length, ICON_SIZE_2);

// ---------- main group ----------
const group = clone(grpTpl);
group.id = GROUP_ID; group.uid = uidFor(GROUP_ID);
group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
group.actions = safeActions(); group.conditions = [];
group.anchorFrameType = 'SCREEN'; group.anchorPoint = 'CENTER'; group.selfPoint = 'CENTER';
group.xOffset = 0; group.yOffset = 0;
stripMeta(group);
group.controlledChildren = [energy.id, ...felBoxes.map(b => b.id), health.id, cdGroup.id, cd2Group.id];

// flat list of ALL regions
const children = [energy, ...felBoxes, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];
const top = { d: group, c: children, m: 'd', s: '5.20.2', v: 2000 };

fs.writeFileSync('felsworn-v6.decoded.json', JSON.stringify(top, null, 2));
const str = encodeWA(top);
fs.writeFileSync('felsworn-v6.import.txt', str);
const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
console.log('v6 written: felsworn-v6.import.txt (' + str.length + ' chars) | self round-trip:', ok);
console.log('total regions:', children.length, '| main CDs:', mainIcons.length, '| secondary CDs:', secIcons.length);
