// Shared WeakAuras package engine — class-agnostic region/trigger builders + the encode/
// write/rotate pipeline. Class files under classes/<name>/build.js declare their data
// (colors, geometry, resource model, cooldown lists) and assemble regions with these helpers.
//
// Design notes captured elsewhere in the project (see CLAUDE.md):
//  - uids are DETERMINISTIC from the (stable) id via uidFor() so re-imports say "Update"
//    instead of creating a new aura set. Rename an element -> its uid changes; that's the only time.
//  - we clone known-good Luxthos regions (lib/templates/*.json) so every field WeakAuras 5.x
//    needs is present, then override only what matters.
const fs = require('fs');
const path = require('path');
const { encodeWA, decodeWA } = require('./wa-codec.js');

const TPL_DIR = path.join(__dirname, 'templates');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const templates = {
  bar: JSON.parse(fs.readFileSync(path.join(TPL_DIR, 'bar.json'), 'utf8')),
  icon: JSON.parse(fs.readFileSync(path.join(TPL_DIR, 'icon.json'), 'utf8')),
  group: JSON.parse(fs.readFileSync(path.join(TPL_DIR, 'group.json'), 'utf8')),
  dyngroup: JSON.parse(fs.readFileSync(path.join(TPL_DIR, 'dyngroup.json'), 'utf8')),
};

const clone = o => JSON.parse(JSON.stringify(o));

// Deterministic 11-char uid from an id (FNV-1a x2 -> base61). Stable across builds.
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

// A trivial stateupdate that keeps a bar 100% full (portable — no aura API needed).
const ALWAYS_FULL_LUA = `function(allstates, event, ...)
    allstates[""] = { show = true, changed = true, progressType = "static", value = 1, total = 1 }
    return true
end`;
const DG_SHOW_LUA = 'function(allstates, event, ...)\n    allstates[""] = { show = true, changed = true }\n    return true\nend';

// ---------- bars ----------
function baseBar(groupId, id) {
  const b = clone(templates.bar);
  b.id = id; b.uid = uidFor(id); b.parent = groupId;
  b.load = loadAlways(); b.actions = safeActions(); b.conditions = [];
  stripMeta(b);
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = 0; b.yOffset = 0; b.isPrimaryResource = false;
  b.config = []; b.authorOptions = []; b.configGroup = '';
  b.useAdjustededMax = false; b.adjustedMax = ''; b.useAdjustededMin = false; b.adjustedMin = '';
  b.progressSource = [-1, ''];
  return b;
}
function gradient(b, hi, lo) {
  b.enableGradient = true;
  b.gradientOrientation = 'HORIZONTAL';
  b.barColor = hi.slice();
  b.barColor2 = lo.slice();
}
function barText(b, txt, size) {
  for (const sr of (b.subRegions || [])) {
    if (sr.type === 'subtext') { sr.text_text = txt; sr.text_fontSize = size || 12; sr.text_visible = txt !== ''; }
    if (sr.type === 'subborder') { sr.border_visible = true; sr.border_color = [0, 0, 0, 0.9]; sr.border_size = 1; }
  }
}

// A segmented point-resource box (Felfury stacks, Runic Brand stacks, ...). Empty by default;
// a condition paints a gradient fill when the tracked buff/debuff reaches `index` stacks.
//   unit: 'player' (self buff) | 'target' (target debuff); debuffType: 'HELPFUL' | 'HARMFUL'
function segmentBar(groupId, o) {
  const b = baseBar(groupId, o.id);
  b.width = o.width; b.height = o.height; b.xOffset = o.xOffset; b.yOffset = o.yOffset;
  b.enableGradient = false; b.gradientOrientation = 'HORIZONTAL';
  b.barColor = [0, 0, 0, 0]; b.barColor2 = [0, 0, 0, 0];
  b.backgroundColor = o.emptyBg.slice(); b.smoothProgress = false;
  const unitExists = o.unitExists !== undefined ? o.unitExists : (o.unit === 'player');
  b.triggers = wrap([
    T({ type: 'aura2', unit: o.unit, debuffType: o.debuffType, useName: true, auranames: o.auraNames.slice(),
        names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
        unitExists, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health' }),
    T({ type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
        events: 'PLAYER_ENTERING_WORLD, OPTIONS', custom: ALWAYS_FULL_LUA, unit: 'player',
        debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: [] })
  ], 2);
  b.conditions = [{
    check: { op: '>=', trigger: 1, variable: 'stacks', value: String(o.index) },
    changes: [
      { property: 'enableGradient', value: true },
      { property: 'barColor', value: o.hiColor.slice() },
      { property: 'barColor2', value: o.loColor.slice() }
    ]
  }];
  barText(b, '', 10);
  return b;
}

// A segmented box driven by a SPELL'S CHARGES (fills when charges >= index). Same look as
// segmentBar but trigger 1 is a Cooldown Progress (Spell) trigger, so the fill tracks the
// spell's current charge count (e.g. Runeblade 0..3). Trigger 2 keeps a filled box 100% wide.
//   o = { id, index, spell, byName?, hiColor, loColor, emptyBg, width, height, xOffset, yOffset }
function chargeSegmentBar(groupId, o) {
  const b = baseBar(groupId, o.id);
  b.width = o.width; b.height = o.height; b.xOffset = o.xOffset; b.yOffset = o.yOffset;
  b.enableGradient = false; b.gradientOrientation = 'HORIZONTAL';
  b.barColor = [0, 0, 0, 0]; b.barColor2 = [0, 0, 0, 0];
  b.backgroundColor = o.emptyBg.slice(); b.smoothProgress = false;
  b.triggers = wrap([
    T(cooldownTrigger(o.spell, o.byName)),
    T({ type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
        events: 'PLAYER_ENTERING_WORLD, OPTIONS', custom: ALWAYS_FULL_LUA, unit: 'player',
        debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: [] })
  ], 2);
  b.conditions = [{
    check: { op: '>=', trigger: 1, variable: 'charges', value: String(o.index) },
    changes: [
      { property: 'enableGradient', value: true },
      { property: 'barColor', value: o.hiColor.slice() },
      { property: 'barColor2', value: o.loColor.slice() }
    ]
  }];
  barText(b, '', 10);
  return b;
}

// ---------- triggers ----------
function powerTrigger(powertype) {
  return {
    use_unit: true, duration: '1', use_powertype: true, use_absorbMode: true,
    unevent: 'auto', powertype, unit: 'player', type: 'unit', event: 'Power',
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}
function healthTrigger(unit) {
  return {
    use_unit: true, use_absorbMode: true, unevent: 'auto', unit: unit || 'player',
    type: 'unit', event: 'Health', use_healthpct: false,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}
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
// self buff/proc — matchesShowOn 'showOnActive' means it only "shows" while active
function buffTrigger(name, showOn) {
  return {
    type: 'aura2', unit: 'player', debuffType: 'HELPFUL', useName: true, auranames: [name],
    names: [], spellIds: [], auraspellids: [], matchesShowOn: showOn || 'showOnActive', ownOnly: true,
    unitExists: true, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
// target debuff — 'showAlways' so we can read its stack count (0..N) any time
function targetDebuffTrigger(names) {
  return {
    type: 'aura2', unit: 'target', debuffType: 'HARMFUL', useName: true, auranames: names.slice(),
    names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
    unitExists: false, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
function targetHealthTrigger() {
  return {
    type: 'unit', event: 'Health', use_unit: true, unit: 'target', use_absorbMode: true,
    unevent: 'auto', use_percenthealth: false, unitExists: false,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}

// ---------- sub-regions / conditions ----------
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
// A glow sub-region (works on bars too — anchor_area 'bar'). Off by default; a condition turns it on.
function subglow() {
  return {
    type: 'subglow', glow: false, useGlowColor: false, glowColor: [1, 1, 1, 1],
    glowType: 'Pixel', glowLines: 8, glowFrequency: 0.25, glowLength: 10, glowThickness: 1,
    glowScale: 1, glowBorder: false, glowXOffset: 0, glowYOffset: 0, glowDuration: 1, anchor_area: 'bar'
  };
}
// glowType: 'buttonOverlay' (Action Button Glow) | 'Pixel' | 'ACShine'
function glowChanges(color, glowType) {
  return [
    { property: 'sub.3.glow', value: true },
    { property: 'sub.3.glowType', value: glowType || 'buttonOverlay' },
    { property: 'sub.3.useGlowColor', value: true },
    { property: 'sub.3.glowColor', value: color.slice() }
  ];
}

// ---------- icons ----------
// Returns the icon skeleton (cooldown-ready, glow reset). The caller attaches triggers/conditions
// — glow logic differs enough per class that it stays in the class file.
function iconBase(groupId, o) {
  const b = clone(templates.icon);
  b.id = o.id; b.uid = uidFor(o.id); b.parent = o.parentId;
  b.load = loadAlways(); b.actions = safeActions();
  stripMeta(b);
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = 0; b.yOffset = 0;
  b.width = o.size; b.height = o.size;
  b.auto = true; b.iconSource = -1; b.displayIcon = o.fallbackIcon || '';
  b.cooldown = true; b.cooldownSwipe = true; b.cooldownTextDisabled = false; b.cooldownEdge = false;
  b.desaturate = false; b.color = [1, 1, 1, 1];
  b.config = []; b.authorOptions = []; b.information = {};
  for (const sr of (b.subRegions || [])) { if (sr.type === 'subglow') { sr.glow = false; } }
  return b;
}

// ---------- dynamic group (centered, wrapping icon row) ----------
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
// o = { yOffset, iconSize, perRow?, maxWidth? }. If maxWidth is given, perRow is derived so a row never
// exceeds maxWidth (hSpace = 4, matching customGrowLua) — this is the dynamicgroup's "max size".
function makeDynGroup(groupId, id, children, o) {
  const dg = clone(templates.dyngroup);
  dg.id = id; dg.uid = uidFor(id); dg.parent = groupId;
  dg.load = loadAlways(); dg.actions = safeActions(); dg.conditions = [];
  stripMeta(dg);
  dg.controlledChildren = children.map(r => r.id);
  const perRow = o.maxWidth
    ? Math.max(1, Math.floor((o.maxWidth + 4) / (o.iconSize + 4)))
    : o.perRow;
  dg.grow = 'CUSTOM';
  dg.customGrow = customGrowLua(perRow, o.iconSize);
  dg.align = 'CENTER';
  dg.space = 4; dg.stagger = 0; dg.sort = 'none';
  dg.useLimit = false;
  dg.anchorFrameType = 'SCREEN'; dg.anchorPoint = 'CENTER'; dg.selfPoint = 'CENTER';
  dg.xOffset = 0; dg.yOffset = o.yOffset;
  dg.border = false;
  dg.triggers = wrap([T({
    type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
    events: 'PLAYER_ENTERING_WORLD, OPTIONS', custom: DG_SHOW_LUA,
    unit: 'player', debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  })], -10);
  return dg;
}

// ---------- root group ----------
function makeGroup(groupId, controlledChildren) {
  const group = clone(templates.group);
  group.id = groupId; group.uid = uidFor(groupId);
  group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
  group.actions = safeActions(); group.conditions = [];
  group.anchorFrameType = 'SCREEN'; group.anchorPoint = 'CENTER'; group.selfPoint = 'CENTER';
  group.xOffset = 0; group.yOffset = 0;
  stripMeta(group);
  group.controlledChildren = controlledChildren.slice();
  return group;
}

// ---------- assemble + encode + write (rotates the previous import) ----------
function buildPackage({ name, group, children }) {
  const top = { d: group, c: children, m: 'd', s: '5.20.2', v: 2000 };
  const str = encodeWA(top);
  const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
  if (!ok) throw new Error(`[${name}] self round-trip FAILED — refusing to write`);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const cur = path.join(DIST_DIR, `${name}.import.txt`);
  const prev = path.join(DIST_DIR, `${name}.prev.import.txt`);
  if (fs.existsSync(cur)) fs.copyFileSync(cur, prev);   // rotate: current -> previous
  fs.writeFileSync(cur, str);
  fs.writeFileSync(path.join(DIST_DIR, `${name}.decoded.json`), JSON.stringify(top, null, 2));

  console.log(`[${name}] dist/${name}.import.txt (${str.length} chars) | round-trip: ${ok} | regions: ${children.length}`);
  return { str, ok, top };
}

module.exports = {
  clone, uidFor, loadAlways, safeActions, stripMeta, wrap, T,
  templates, ALWAYS_FULL_LUA,
  baseBar, gradient, barText, segmentBar, chargeSegmentBar,
  powerTrigger, healthTrigger, cooldownTrigger, buffTrigger, targetDebuffTrigger, targetHealthTrigger,
  chargesSubtext, glowChanges, subglow, iconBase, makeDynGroup, makeGroup, buildPackage,
  DIST_DIR,
};
