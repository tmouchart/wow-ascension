// Felsworn Tyrant WeakAura v4: Energy bar + Felfury boxes + cooldown icons in a
// centered, wrapping dynamicgroup row (Luxthos-style), icons 30x30.
const fs = require('fs');
const { encodeWA, decodeWA } = require('./wa-codec.js');

const barTpl = JSON.parse(fs.readFileSync('_template-bar.json', 'utf8'));
const iconTpl = JSON.parse(fs.readFileSync('_template-icon.json', 'utf8'));
const grpTpl = JSON.parse(fs.readFileSync('_template-group.json', 'utf8'));
const dgTpl = JSON.parse(fs.readFileSync('_template-dyngroup.json', 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

const GROUP_ID = 'Felsworn Tyrant';
const CD_GROUP_ID = 'Felsworn CDs';
const FELSWORN_GREEN = [0.337, 0.729, 0.016, 1];
const EMPTY_BG = [0.09, 0.11, 0.09, 0.9];
const MAX_FELFURY = 6;
const ICON_SIZE = 30;
const PER_ROW = 8;

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

// ---------- Energy bar ----------
function baseBar(id, uid) {
  const b = clone(barTpl);
  b.id = id; b.uid = uid; b.parent = GROUP_ID;
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
    if (sr.type === 'subtext') { sr.text_text = txt; sr.text_fontSize = size || 14; sr.text_visible = txt !== ''; }
    if (sr.type === 'subborder') { sr.border_visible = true; sr.border_color = [0, 0, 0, 0.9]; sr.border_size = 1; }
  }
}

const energy = baseBar('Felsworn Energy', 'felswrnEnrg01');
energy.yOffset = -180; energy.width = 300; energy.height = 22;
energy.barColor = [1, 0.82, 0.0, 1]; energy.backgroundColor = [0.12, 0.1, 0.0, 0.8];
energy.triggers = wrap([T({
  use_unit: true, duration: '1', use_powertype: true, use_absorbMode: true,
  unevent: 'auto', powertype: 3, unit: 'player', type: 'unit', event: 'Power',
  subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
})], -10);
barText(energy, '%p', 14);

// ---------- Felfury boxes ----------
const alwaysFullLua = `function(allstates, event, ...)
    allstates[""] = { show = true, changed = true, progressType = "static", value = 1, total = 1 }
    return true
end`;
const BOX_W = 44, BOX_H = 20, PITCH = 50;
const startX = -((MAX_FELFURY - 1) * PITCH) / 2;
const felBoxes = [];
for (let i = 1; i <= MAX_FELFURY; i++) {
  const b = baseBar('Felsworn Felfury ' + i, 'felswrnFf0' + i);
  b.width = BOX_W; b.height = BOX_H; b.xOffset = startX + (i - 1) * PITCH; b.yOffset = -206;
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
    changes: [{ property: 'barColor', value: FELSWORN_GREEN.slice() }]
  }];
  barText(b, '', 10);
  felBoxes.push(b);
}

// ---------- Cooldown icons (children of the dynamicgroup) ----------
function cooldownTrigger(spell, byName) {
  return {
    type: 'spell', event: 'Cooldown Progress (Spell)',
    use_genericShowOn: true, genericShowOn: 'showAlways',
    use_track: true, track: 'auto', use_unit: true, unit: 'player',
    use_spellName: true, spellName: spell, realSpellName: byName ? spell : spell,
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

const ICONS = [
  { label: 'Hateforged Barrier', spell: 705129, glowBuff: 'Hateforged Barrier' },
  { label: 'Skull of Guldan', spell: 800225 },
  { label: 'Annihilation', spell: 803904 },
  { label: 'Tyrants Gaze', spell: 805240 },
  { label: 'Reckoning', spell: 802058 },
  { label: 'Manaburn', spell: 805248 },
  { label: 'Chaos Rush', spell: 'Chaos Rush', byName: true, charges: true },
  { label: 'Fel Fireball', spell: 1970, glowBuff: 'Carve' }
];

const iconRegions = [];
ICONS.forEach((cfg, idx) => {
  const b = clone(iconTpl);
  b.id = 'Felsworn CD - ' + cfg.label;
  b.uid = 'felswrnCd' + String(idx + 1).padStart(2, '0');
  b.parent = CD_GROUP_ID;                 // child of the dynamicgroup
  b.load = loadAlways(); b.actions = safeActions();
  stripMeta(b);
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = 0; b.yOffset = 0;            // position controlled by the dynamicgroup
  b.width = ICON_SIZE; b.height = ICON_SIZE;
  b.auto = true; b.iconSource = -1; b.displayIcon = '';
  b.cooldown = true; b.cooldownSwipe = true; b.cooldownTextDisabled = false; b.cooldownEdge = false;
  b.desaturate = false; b.color = [1, 1, 1, 1];
  b.config = []; b.authorOptions = []; b.information = {};
  for (const sr of (b.subRegions || [])) { if (sr.type === 'subglow') { sr.glow = false; } }

  const triggerArr = [T(cooldownTrigger(cfg.spell, cfg.byName))];
  const conditions = [
    { check: { trigger: 1, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }
  ];
  if (cfg.glowBuff) {
    triggerArr.push(T(buffTrigger(cfg.glowBuff)));
    conditions.push({
      check: { trigger: 2, variable: 'show', value: 1 },
      changes: [
        { property: 'sub.3.glow', value: true },
        { property: 'sub.3.glowType', value: 'Pixel' },
        { property: 'sub.3.useGlowColor', value: true },
        { property: 'sub.3.glowColor', value: FELSWORN_GREEN.slice() }
      ]
    });
  }
  b.triggers = wrap(triggerArr, 1);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), chargesSubtext()]; }
  iconRegions.push(b);
});

// ---------- Cooldown dynamicgroup (centered, wrapping row) ----------
const customGrowLua = `function(newPositions, activeRegions)
    local perRow = ${PER_ROW}
    local w, h = ${ICON_SIZE}, ${ICON_SIZE}
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

const cdGroup = clone(dgTpl);
cdGroup.id = CD_GROUP_ID; cdGroup.uid = 'felswrnCdGrp1';
cdGroup.parent = GROUP_ID;
cdGroup.load = loadAlways(); cdGroup.actions = safeActions(); cdGroup.conditions = [];
stripMeta(cdGroup);
cdGroup.controlledChildren = iconRegions.map(r => r.id);
cdGroup.grow = 'CUSTOM';
cdGroup.customGrow = customGrowLua;
cdGroup.align = 'CENTER';
cdGroup.space = 4; cdGroup.stagger = 0; cdGroup.sort = 'none';
cdGroup.useLimit = false;
cdGroup.anchorFrameType = 'SCREEN'; cdGroup.anchorPoint = 'CENTER'; cdGroup.selfPoint = 'CENTER';
cdGroup.xOffset = 0; cdGroup.yOffset = -140;
cdGroup.border = false;
cdGroup.triggers = wrap([T({
  type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
  events: 'PLAYER_ENTERING_WORLD, OPTIONS',
  custom: 'function(allstates, event, ...)\n    allstates[""] = { show = true, changed = true }\n    return true\nend',
  unit: 'player', debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
})], -10);

// ---------- main group ----------
const group = clone(grpTpl);
group.id = GROUP_ID; group.uid = 'felswrnGrp004';
group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
group.actions = safeActions(); group.conditions = [];
group.anchorFrameType = 'SCREEN'; group.anchorPoint = 'CENTER'; group.selfPoint = 'CENTER';
group.xOffset = 0; group.yOffset = 0;
stripMeta(group);
group.controlledChildren = [energy.id, ...felBoxes.map(b => b.id), cdGroup.id];

// flat list of ALL regions
const children = [energy, ...felBoxes, cdGroup, ...iconRegions];
const top = { d: group, c: children, m: 'd', s: '5.20.2', v: 2000 };

fs.writeFileSync('felsworn-v4.decoded.json', JSON.stringify(top, null, 2));
const str = encodeWA(top);
fs.writeFileSync('felsworn-v4.import.txt', str);
const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
console.log('v4 written: felsworn-v4.import.txt (' + str.length + ' chars) | self round-trip:', ok);
console.log('total regions:', children.length, '| CD icons:', iconRegions.length);
