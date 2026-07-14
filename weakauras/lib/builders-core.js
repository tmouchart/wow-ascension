// Isomorphic WeakAuras package engine — class-agnostic region/trigger builders + the pure
// `assembleTop` envelope. NO fs/path/zlib here, so this file runs unchanged in the browser
// (Vite/esbuild inlines the JSON template imports). The Node-only encode/write/rotate pipeline
// (`buildPackage`) lives in builders.js, which re-exports everything from this core.
//
// Design notes captured elsewhere in the project (see CLAUDE.md):
//  - uids are DETERMINISTIC from the (stable) id via uidFor() so re-imports say "Update"
//    instead of creating a new aura set. Rename an element -> its uid changes; that's the only time.
//  - we clone known-good Luxthos regions (lib/templates/*.json) so every field WeakAuras 5.x
//    needs is present, then override only what matters.
// Templates via require('*.json') (not fs) so the region builders are isomorphic — a browser bundler
// (Vite/esbuild) inlines these JSON imports, letting the same builders run client-side.
const templates = {
  bar: require('./templates/bar.json'),
  icon: require('./templates/icon.json'),
  group: require('./templates/group.json'),
  dyngroup: require('./templates/dyngroup.json'),
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
const stripMeta = (o) => { delete o.wagoID; delete o.url; delete o.source; delete o.semver; delete o.desc; };
const PKG_DESC = 'Made by Sheikz - inspired by Luxthos weakaura style';
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

// A maintenance-buff UPTIME bar (keep-it-up-24/7). Duration countdown that colors green -> yellow (<=8s)
// -> red (<=4s); when the buff is DOWN the bar goes deep red, swaps the label to a warning subtext, and
// pulses a red Pixel glow. Tracks one buff by name, or ANY of several (buff: string | string[]).
//   cfg: { id, yOffset, width, height, buff, label, warnText, bg, downBg?, colors? }
// warnSubtext -> sub.5, subglow -> sub.6 (the label is sub.4). colors default to the shared green/red set.
function uptimeBar(groupId, cfg) {
  const C = cfg.colors || { green: [0.30, 0.75, 0.15, 1], yellow: [1, 0.80, 0.10, 1],
    red: [1, 0.35, 0.05, 1], down: [0.70, 0.05, 0.05, 1], glow: [1, 0.15, 0.10, 1] };
  const b = baseBar(groupId, cfg.id);
  b.yOffset = cfg.yOffset; b.width = cfg.width; b.height = cfg.height;
  b.enableGradient = false; b.barColor = C.green.slice(); b.backgroundColor = cfg.bg.slice();
  const trig = Array.isArray(cfg.buff) ? anyBuffTrigger(cfg.buff) : buffTrigger(cfg.buff, 'showAlways');
  b.triggers = wrap([T(trig)], 1);
  b.progressSource = [-1, ''];
  const label = b.subRegions.find(s => s.type === 'subtext');
  label.text_text = cfg.label; label.text_fontSize = 11; label.text_visible = true;
  label.anchor_point = 'INNER_CENTER'; label.text_color = [1, 1, 1, 1];
  b.subRegions = [...b.subRegions, warnSubtext(cfg.warnText), subglow()];
  b.conditions = [
    { check: { op: '<=', trigger: 1, variable: 'expirationTime', value: '8' }, changes: [{ property: 'barColor', value: C.yellow.slice() }] },
    { check: { op: '<=', trigger: 1, variable: 'expirationTime', value: '4' }, changes: [{ property: 'barColor', value: C.red.slice() }] },
    { check: { trigger: 1, variable: 'buffed', value: 0 },
      changes: [
        { property: 'barColor', value: C.down.slice() },
        { property: 'backgroundColor', value: (cfg.downBg || [0.20, 0.02, 0.02, 0.9]).slice() },
        { property: 'sub.4.text_visible', value: false },
        { property: 'sub.5.text_visible', value: true },
        { property: 'sub.6.glow', value: true },
        { property: 'sub.6.glowType', value: 'Pixel' },
        { property: 'sub.6.useGlowColor', value: true },
        { property: 'sub.6.glowColor', value: C.glow.slice() }
      ] }
  ];
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
// Any spell-stealable (magic) buff on the target — matched by the `use_stealable` filter, NOT by name,
// so it catches EVERY stealable buff (confirmed in WeakAuras BuffTrigger2: `use_stealable = true` keeps
// only auras whose matchData.isStealable is set). matchesShowOn 'showOnActive' so the state is active
// only while one is present; pair with an icon at iconSource -1 to display the matched buff's own icon.
function stealableTargetTrigger() {
  return {
    type: 'aura2', unit: 'target', debuffType: 'HELPFUL', use_stealable: true,
    useName: false, auranames: [], names: [], spellIds: [], auraspellids: [],
    matchesShowOn: 'showOnActive', ownOnly: false, unitExists: false,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
function targetHealthTrigger() {
  return {
    type: 'unit', event: 'Health', use_unit: true, unit: 'target', use_absorbMode: true,
    unevent: 'auto', use_percenthealth: false, unitExists: false,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}
// self buff matching ANY of several names (one uptime state from interchangeable buffs — e.g. "enraged")
function anyBuffTrigger(names) {
  return {
    type: 'aura2', unit: 'player', debuffType: 'HELPFUL', useName: true, auranames: names.slice(),
    names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
    unitExists: true, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
// Custom stateupdate: shown only while UnitPower(player, powertype) >= amount. Reads the raw power API
// directly — a built-in Power/Health "min value" trigger filter does NOT gate on the Ascension client.
function powerAtLeastTrigger(amount, powertype) {
  return {
    type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
    events: 'UNIT_POWER_UPDATE, UNIT_POWER_FREQUENT, UNIT_MAXPOWER, PLAYER_ENTERING_WORLD',
    custom: `function(allstates, event, ...)
    local p = UnitPower("player", ${powertype})
    allstates[""] = { show = (p >= ${amount}), changed = true }
    return true
end`,
    unit: 'player', debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}
// Custom stateupdate: shown only while the TARGET is under pct% HP (execute window). Reads UnitHealth
// directly (same reason as above — the built-in Health percent filter does not gate on this client).
function targetExecuteTrigger(pct) {
  const frac = pct / 100;
  return {
    type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
    events: 'UNIT_HEALTH, UNIT_MAXHEALTH, PLAYER_TARGET_CHANGED, PLAYER_ENTERING_WORLD',
    custom: `function(allstates, event, ...)
    local show = false
    if UnitExists("target") and UnitHealthMax("target") > 0 then
        show = (UnitHealth("target") / UnitHealthMax("target")) < ${frac}
    end
    allstates[""] = { show = show, changed = true }
    return true
end`,
    unit: 'target', debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  };
}

// ---------- sub-regions / conditions ----------
// A hidden centered warning subtext for a bar's DOWN state (buff fell off). Toggled visible by a
// condition. Reddish, outlined; append after the bar's stock subRegions (becomes sub.5).
function warnSubtext(text) {
  return {
    type: 'subtext', text_text: text, text_visible: false, text_color: [1, 0.35, 0.30, 1],
    text_font: 'Friz Quadrata TT', text_fontSize: 12, text_fontType: 'OUTLINE',
    anchor_point: 'INNER_CENTER', text_selfPoint: 'AUTO', anchorXOffset: 0, anchorYOffset: 0,
    text_shadowColor: [0, 0, 0, 1], text_shadowXOffset: 1, text_shadowYOffset: -1,
    text_justify: 'CENTER', rotateText: 'NONE', text_wordWrap: 'WordWrap',
    text_automaticWidth: 'Auto', text_fixedWidth: 64
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

// The unified cooldown-icon element (replaces the per-class makeIcon). Base = iconBase + a Cooldown
// Progress (Spell) trigger + "desaturate while onCooldown", then AT MOST ONE glow rule (every class
// icon uses exactly one), an optional charge subtext, and optional Energy show-gating. Glow color/style
// are explicit data (glowColor/glowType) — no per-class defaults live here.
//   cfg: { id, parentId, size, spell, byName?, fallbackIcon?, charges?, xOffset?, yOffset?,
//          showPowerAbove?, powerType? (default 3),   // gate: only shown at >= N power
//          proc?,                                      // proc-only base (buff show==1), no cooldown trigger
//          glowColor?, glowType?,                      // color/style for the ONE glow rule below
//          glowReady? | glowReadyPower? | glowPowerPct? | glowBuff? | glowBuffMissing? |
//          glowTargetHealthBelow? | glowOnCharges?({spell,byName?,op?,value,color,glowType?}) }
// glowBuff (a CD that grants a self-buff): also switches the icon's swipe/duration to the BUFF's
// remaining time while it's up (cooldown swipe otherwise) — see the first-active branch below.
function cooldownIcon(cfg) {
  const b = iconBase(cfg.parentId, { id: cfg.id, parentId: cfg.parentId, size: cfg.size, fallbackIcon: cfg.fallbackIcon });
  if (cfg.xOffset !== undefined) b.xOffset = cfg.xOffset;
  if (cfg.yOffset !== undefined) b.yOffset = cfg.yOffset;
  const glow = () => glowChanges(cfg.glowColor, cfg.glowType);
  let triggerArr, conditions, activeMode = 1;

  if (cfg.proc) {
    triggerArr = [T(buffTrigger(cfg.proc))];
    conditions = [{ check: { trigger: 1, variable: 'show', value: 1 }, changes: glow() }];
  } else if (cfg.glowBuff && !cfg.showPowerAbove) {
    // CD that grants a SELF-BUFF: while the buff is up, the icon's swipe/duration shows the BUFF's
    // remaining time (not the cooldown). The buff trigger is FIRST and activeTriggerMode = -10
    // ("first active", Private.trigger_modes.first_active), so the display uses the buff while it's up
    // and falls back to the cooldown when it drops. iconSource is pinned to the cooldown trigger so the
    // spell art never changes; the icon stays full-color + glows while the buff is up, and desaturates
    // (cooldown swipe) once the buff is gone and the spell is still on cooldown.
    triggerArr = [
      T(buffTrigger(cfg.glowBuff)),                 // trigger 1: self-buff (duration + glow)
      T(cooldownTrigger(cfg.spell, cfg.byName))     // trigger 2: cooldown (always shown, spell art)
    ];
    b.iconSource = 2; activeMode = -10;
    conditions = [
      { check: { trigger: 2, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] },
      { check: { trigger: 1, variable: 'show', value: 1 }, changes: [{ property: 'desaturate', value: false }, ...glow()] }
    ];
  } else {
    const pt = cfg.powerType || 3;
    let cdIdx;
    triggerArr = [];
    if (cfg.showPowerAbove) {
      triggerArr.push(T(powerAtLeastTrigger(cfg.showPowerAbove, pt)));   // trigger 1 gates show
      triggerArr.push(T(cooldownTrigger(cfg.spell, cfg.byName)));
      cdIdx = 2; b.iconSource = 2;
    } else {
      triggerArr.push(T(cooldownTrigger(cfg.spell, cfg.byName)));
      cdIdx = 1;
    }
    conditions = [{ check: { trigger: cdIdx, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }];

    if (cfg.glowReady) {
      conditions.push({ check: { trigger: cdIdx, variable: 'onCooldown', value: 0 }, changes: glow() });
    } else if (cfg.glowReadyPower) {
      triggerArr.push(T(powerTrigger(pt)));
      conditions.push({ check: { trigger: -2, variable: 'AND', checks: [
        { trigger: cdIdx, variable: 'onCooldown', value: 0 },
        { trigger: triggerArr.length, variable: 'power', op: '>=', value: String(cfg.glowReadyPower) }
      ] }, changes: glow() });
    } else if (cfg.glowPowerPct) {
      triggerArr.push(T(powerTrigger(pt)));
      conditions.push({ check: { trigger: triggerArr.length, variable: 'percentpower', op: '>=', value: String(cfg.glowPowerPct) }, changes: glow() });
    } else if (cfg.glowBuff) {
      triggerArr.push(T(buffTrigger(cfg.glowBuff)));
      conditions.push({ check: { trigger: triggerArr.length, variable: 'show', value: 1 }, changes: glow() });
    } else if (cfg.glowBuffMissing) {
      triggerArr.push(T(buffTrigger(cfg.glowBuffMissing, 'showAlways')));
      conditions.push({ check: { trigger: triggerArr.length, variable: 'buffed', value: 0 }, changes: glow() });
    } else if (cfg.glowTargetHealthBelow) {
      triggerArr.push(T(targetHealthTrigger()));
      conditions.push({ check: { trigger: triggerArr.length, variable: 'percenthealth', op: '<', value: String(cfg.glowTargetHealthBelow) }, changes: glow() });
    } else if (cfg.glowOnCharges) {
      const g = cfg.glowOnCharges;
      triggerArr.push(T(cooldownTrigger(g.spell, g.byName)));
      conditions.push({ check: { op: g.op || '>=', trigger: triggerArr.length, variable: 'charges', value: String(g.value) }, changes: glowChanges(g.color, g.glowType) });
    }
  }
  b.triggers = wrap(triggerArr, activeMode);
  b.conditions = conditions;
  if (cfg.charges) b.subRegions = [...(b.subRegions || []), chargesSubtext()];
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

// vertical (top->bottom) grow, icons centered on the group's yOffset. For side-rail columns.
function vGrowLua(iconSize) {
  return `function(newPositions, activeRegions)
    local h = ${iconSize}
    local vSpace = 4
    local n = #activeRegions
    local totalH = n * h + (n - 1) * vSpace
    local startY = totalH / 2 - h / 2
    for i = 1, n do
        newPositions[i] = { 0, startY - (i - 1) * (h + vSpace) }
    end
end`;
}
// A vertical Column container (side rail) — a dynamicgroup that stacks its icons top->bottom, offset to
// one flank of the WA. o = { xOffset, yOffset, iconSize }. Left column: negative xOffset; right: positive.
function makeColumn(groupId, id, children, o) {
  const dg = makeDynGroup(groupId, id, children, { yOffset: o.yOffset, perRow: 1, iconSize: o.iconSize });
  dg.xOffset = o.xOffset;
  dg.customGrow = vGrowLua(o.iconSize);
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
  group.desc = PKG_DESC;
  group.controlledChildren = controlledChildren.slice();
  return group;
}

// ---------- assemble the top-level export envelope (pure) ----------
// combatOnly: load every region (group + all children) only while in combat, so the whole package
// hides out of combat. Children are independent displays, so the flag must be set on each of them.
// No codec, no fs — the browser calls this then awaits its own (CompressionStream) encodeWA; Node's
// buildPackage (builders.js) encodes + writes.
function assembleTop({ group, children, combatOnly }) {
  if (combatOnly) for (const r of [group, ...children]) { r.load = r.load || {}; r.load.use_combat = true; }
  return { d: group, c: children, m: 'd', s: '5.20.2', v: 2000 };
}

module.exports = {
  clone, uidFor, loadAlways, safeActions, stripMeta, wrap, T,
  templates, ALWAYS_FULL_LUA,
  baseBar, gradient, barText, segmentBar, chargeSegmentBar, uptimeBar,
  powerTrigger, healthTrigger, cooldownTrigger, buffTrigger, targetDebuffTrigger, targetHealthTrigger,
  anyBuffTrigger, powerAtLeastTrigger, targetExecuteTrigger, stealableTargetTrigger,
  chargesSubtext, warnSubtext, glowChanges, subglow, iconBase, cooldownIcon,
  vGrowLua, makeDynGroup, makeColumn, makeGroup, assembleTop,
};
