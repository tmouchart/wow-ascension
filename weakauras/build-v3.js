// Felsworn Tyrant WeakAura v3: Energy bar + Felfury boxes + cooldown icon row.
const fs = require('fs');
const { encodeWA, decodeWA } = require('./wa-codec.js');

const barTpl = JSON.parse(fs.readFileSync('_template-bar.json', 'utf8'));
const iconTpl = JSON.parse(fs.readFileSync('_template-icon.json', 'utf8'));
const grpTpl = JSON.parse(fs.readFileSync('_template-group.json', 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

const GROUP_ID = 'Felsworn Tyrant';
const FELSWORN_GREEN = [0.337, 0.729, 0.016, 1];
const EMPTY_BG = [0.09, 0.11, 0.09, 0.9];
const MAX_FELFURY = 6;

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

// ---------- Cooldown icons ----------
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
    text_font: 'Friz Quadrata TT', text_fontSize: 16, text_fontType: 'OUTLINE',
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

const ICON_SIZE = 42, ICON_PITCH = 48;
const iconStartX = -((ICONS.length - 1) * ICON_PITCH) / 2;
const iconRegions = [];
ICONS.forEach((cfg, idx) => {
  const b = clone(iconTpl);
  b.id = 'Felsworn CD - ' + cfg.label;
  b.uid = 'felswrnCd' + String(idx + 1).padStart(2, '0');
  b.parent = GROUP_ID;
  b.load = loadAlways(); b.actions = safeActions();
  stripMeta(b);
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = iconStartX + idx * ICON_PITCH; b.yOffset = -138;
  b.width = ICON_SIZE; b.height = ICON_SIZE;
  b.auto = true; b.iconSource = -1; b.displayIcon = '';
  b.cooldown = true; b.cooldownSwipe = true; b.cooldownTextDisabled = false; b.cooldownEdge = false;
  b.desaturate = false; b.color = [1, 1, 1, 1];
  b.config = []; b.authorOptions = []; b.information = {};
  // reset the subglow to off by default (condition turns it on)
  for (const sr of (b.subRegions || [])) { if (sr.type === 'subglow') { sr.glow = false; } }

  const triggerArr = [T(cooldownTrigger(cfg.spell, cfg.byName))];
  const conditions = [
    // grey out while on cooldown
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

// ---------- group ----------
const group = clone(grpTpl);
group.id = GROUP_ID; group.uid = 'felswrnGrp003';
group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
group.actions = safeActions(); group.conditions = [];
group.anchorFrameType = 'SCREEN'; group.anchorPoint = 'CENTER'; group.selfPoint = 'CENTER';
group.xOffset = 0; group.yOffset = 0;
stripMeta(group);
const children = [energy, ...felBoxes, ...iconRegions];
group.controlledChildren = children.map(c => c.id);

const top = { d: group, c: children, m: 'd', s: '5.20.2', v: 2000 };

fs.writeFileSync('felsworn-v3.decoded.json', JSON.stringify(top, null, 2));
const str = encodeWA(top);
fs.writeFileSync('felsworn-v3.import.txt', str);
const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
console.log('v3 written: felsworn-v3.import.txt (' + str.length + ' chars) | self round-trip:', ok);
console.log('children (' + children.length + '):', children.map(c => c.id).join(' | '));
