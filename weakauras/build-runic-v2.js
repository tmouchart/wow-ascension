// Runemaster / Runic WeakAura v2 — built on the Felsworn v6 pattern.
// Layout (top -> bottom), same arrangement as Felsworn:
//   [ primary cooldowns / proc / Runic Brand CD ]  <- top icon row
//   [ RUNIC BRAND 3-segment bar ]                   <- target-debuff stacks 0..3
//   [ MANA bar (blue gradient) ]
//   [ HEALTH bar (red gradient) ]
//   [ secondary cooldowns ]                         <- bottom icon row
//
// v2 changes (per François): the Runic Brand debuff on the TARGET is now shown as a
// 3-SEGMENT BAR (fills 0->3, and drops back to 0 when he detonates it — the segments just
// read the debuff's stack count), instead of a numbered icon. The Runic Brand icon stays
// in the top cooldown row but now GLOWS ORANGE WHEN THE SPELL IS UP (off cooldown / ready).
// Runeblade still glows orange when the target's brand hits 3. Power Overwhelming is a
// proc-only icon (appears + purple glow only while the proc is up).
const fs = require('fs');
const { encodeWA, decodeWA } = require('./wa-codec.js');

const barTpl = JSON.parse(fs.readFileSync('_template-bar.json', 'utf8'));
const iconTpl = JSON.parse(fs.readFileSync('_template-icon.json', 'utf8'));
const grpTpl = JSON.parse(fs.readFileSync('_template-group.json', 'utf8'));
const dgTpl = JSON.parse(fs.readFileSync('_template-dyngroup.json', 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

const GROUP_ID = 'Runemaster Runic';
const CD_GROUP_ID = 'Runic CDs (Primary)';
const CD2_GROUP_ID = 'Runic CDs (Secondary)';

// --- gradient palettes (barColor -> barColor2) ---
const MANA_HI = [0.30, 0.55, 1.00, 1];   // mana bright blue
const MANA_LO = [0.05, 0.12, 0.45, 1];   // mana dark blue
const HP_HI   = [0.90, 0.16, 0.12, 1];   // health bright red
const HP_LO   = [0.33, 0.02, 0.02, 1];   // health dark red

// --- glow / accent colors ---
const BRAND_GLOW = [1.00, 0.45, 0.05, 1];  // fire-orange (Runic Brand deals Fire dmg)
const PROC_GLOW  = [0.75, 0.35, 1.00, 1];  // arcane purple (Power Overwhelming proc)
const BRAND_HI   = [1.00, 0.58, 0.12, 1];  // brand segment fill bright orange
const BRAND_LO   = [0.55, 0.20, 0.00, 1];  // brand segment fill dark orange
const BRAND_EMPTY = [0.12, 0.07, 0.02, 0.9]; // empty segment background

// --- geometry ---
const BAR_W = 300;
const MANA_H = 16, HEALTH_H = 14, BRAND_H = 14;
const ICON_SIZE = 32, ICON_SIZE_2 = 26;
const CD_Y = -140;        // top primary cooldown row
const BRAND_Y = -170;     // Runic Brand 3-segment bar
const MANA_Y = -190;      // mana bar
const HEALTH_Y = -208;    // health bar
const CD2_Y = -242;       // bottom secondary cooldown row

// name(s) the Runic Brand debuff might carry on the target — match either (aura2 OR).
const BRAND_AURA_NAMES = ['Runic Brand', 'Marked: Runic Brand'];
const BRAND_MAX = 3;

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

// ---------- Mana bar ----------
const mana = baseBar('Runic Mana', 'runicMana01');
mana.yOffset = MANA_Y; mana.width = BAR_W; mana.height = MANA_H;
gradient(mana, MANA_HI, MANA_LO);
mana.backgroundColor = [0.03, 0.05, 0.14, 0.85];
mana.triggers = wrap([T({
  use_unit: true, duration: '1', use_powertype: true, use_absorbMode: true,
  unevent: 'auto', powertype: 0, unit: 'player', type: 'unit', event: 'Power',
  subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
})], -10);
barText(mana, '%p', 11);

// ---------- Health bar ----------
const health = baseBar('Runic Health', 'runicHp001');
health.yOffset = HEALTH_Y; health.width = BAR_W; health.height = HEALTH_H;
gradient(health, HP_HI, HP_LO);
health.backgroundColor = [0.12, 0.03, 0.03, 0.85];
health.triggers = wrap([T({
  use_unit: true, use_absorbMode: true, unevent: 'auto', unit: 'player',
  type: 'unit', event: 'Health', use_healthpct: false,
  subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
})], -10);
barText(health, '%p', 11);

// ---------- Runic Brand 3-segment bar (target debuff stacks 0..3) ----------
// One aurabar box per stack. Trigger 1 = the Runic Brand debuff on the TARGET (gives the
// stack count); trigger 2 = a trivial always-full stateupdate so a filled box is 100% wide.
// Box i fills orange when stacks >= i. When the debuff is consumed on detonation the stacks
// go to 0 and every box empties — that's the "proc -> back to 0" François described.
const alwaysFullLua = `function(allstates, event, ...)
    allstates[""] = { show = true, changed = true, progressType = "static", value = 1, total = 1 }
    return true
end`;
const SEG_GAP = 6;
const SEG_W = (BAR_W - (BRAND_MAX - 1) * SEG_GAP) / BRAND_MAX;   // 3 segments span the bar width
const segStartX = -BAR_W / 2 + SEG_W / 2;
const brandBoxes = [];
for (let i = 1; i <= BRAND_MAX; i++) {
  const b = baseBar('Runic Brand Seg ' + i, 'runicBrand0' + i);
  b.width = SEG_W; b.height = BRAND_H;
  b.xOffset = segStartX + (i - 1) * (SEG_W + SEG_GAP); b.yOffset = BRAND_Y;
  b.enableGradient = false; b.gradientOrientation = 'HORIZONTAL';
  b.barColor = [0, 0, 0, 0]; b.barColor2 = [0, 0, 0, 0];
  b.backgroundColor = BRAND_EMPTY.slice(); b.smoothProgress = false;
  b.triggers = wrap([
    T({ type: 'aura2', unit: 'target', debuffType: 'HARMFUL', useName: true, auranames: BRAND_AURA_NAMES.slice(),
        names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
        unitExists: false, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health' }),
    T({ type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
        events: 'PLAYER_ENTERING_WORLD, OPTIONS', custom: alwaysFullLua, unit: 'player',
        debuffType: 'HELPFUL', subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: [] })
  ], 2);
  b.conditions = [{
    check: { op: '>=', trigger: 1, variable: 'stacks', value: String(i) },
    changes: [
      { property: 'enableGradient', value: true },
      { property: 'barColor', value: BRAND_HI.slice() },
      { property: 'barColor2', value: BRAND_LO.slice() }
    ]
  }];
  barText(b, '', 10);
  brandBoxes.push(b);
}

// ---------- trigger builders ----------
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
// self buff (proc) — only "shows" while active
function selfProcTrigger(name) {
  return {
    type: 'aura2', unit: 'player', debuffType: 'HELPFUL', useName: true, auranames: [name],
    names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showOnActive', ownOnly: true,
    unitExists: true, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
// debuff on the target — always active so we can read stacks (0..N) any time
function targetDebuffTrigger(names) {
  return {
    type: 'aura2', unit: 'target', debuffType: 'HARMFUL', useName: true, auranames: names.slice(),
    names: [], spellIds: [], auraspellids: [], matchesShowOn: 'showAlways', ownOnly: true,
    unitExists: false, subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
  };
}
function bigStackSubtext() {
  return {
    type: 'subtext', text_text: '%2.s', text_visible: true, text_color: [1, 0.85, 0.55, 1],
    text_font: 'Friz Quadrata TT', text_fontSize: 20, text_fontType: 'OUTLINE',
    anchor_point: 'CENTER', text_selfPoint: 'AUTO', anchorXOffset: 0, anchorYOffset: 0,
    text_shadowColor: [0, 0, 0, 1], text_shadowXOffset: 1, text_shadowYOffset: -1,
    text_justify: 'CENTER', rotateText: 'NONE', text_wordWrap: 'WordWrap',
    text_automaticWidth: 'Auto', text_fixedWidth: 64, text_text_format_2_s_format: 'none'
  };
}
function glowChanges(color) {
  return [
    { property: 'sub.3.glow', value: true },
    { property: 'sub.3.glowType', value: 'Pixel' },
    { property: 'sub.3.useGlowColor', value: true },
    { property: 'sub.3.glowColor', value: color.slice() }
  ];
}

// ---------- icon factory ----------
let iconSeq = 0;
function makeIcon(cfg, parentId, size) {
  const b = clone(iconTpl);
  b.id = 'Runic - ' + cfg.label;
  b.uid = 'runicCd' + String(++iconSeq).padStart(2, '0');
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

  let triggerArr, conditions, activeMode = 1;

  if (cfg.proc) {
    // proc-only icon: appears + glows only while the self buff is active
    triggerArr = [T(selfProcTrigger(cfg.proc))];
    conditions = [{ check: { trigger: 1, variable: 'show', value: 1 }, changes: glowChanges(cfg.glowColor || PROC_GLOW) }];
  } else {
    // cooldown icon (grey while on CD)
    triggerArr = [T(cooldownTrigger(cfg.spell, cfg.byName))];
    conditions = [{ check: { trigger: 1, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] }];

    if (cfg.glowWhenReady) {
      // glow while the spell is UP (off cooldown / ready to cast)
      conditions.push({ check: { trigger: 1, variable: 'onCooldown', value: 0 }, changes: glowChanges(cfg.glowColor || BRAND_GLOW) });
    }
    if (cfg.brandStacks || cfg.glowOnBrand) {
      // trigger 2 = the Runic Brand debuff on the target (stacks 0..BRAND_MAX)
      triggerArr.push(T(targetDebuffTrigger(BRAND_AURA_NAMES)));
      conditions.push({
        check: { op: '>=', trigger: 2, variable: 'stacks', value: String(BRAND_MAX) },
        changes: glowChanges(BRAND_GLOW)
      });
      if (cfg.brandStacks) {
        // show the stack count as a big number; hide it when 0 (not applied)
        b.subRegions = [...(b.subRegions || []), bigStackSubtext()];  // -> sub.4
        conditions.push({
          check: { op: '<=', trigger: 2, variable: 'stacks', value: '0' },
          changes: [{ property: 'sub.4.text_visible', value: false }]
        });
      }
    }
    if (cfg.glowBuff) {
      triggerArr.push(T(selfProcTrigger(cfg.glowBuff)));
      conditions.push({ check: { trigger: triggerArr.length, variable: 'show', value: 1 }, changes: glowChanges(cfg.glowColor || BRAND_GLOW) });
    }
  }

  b.triggers = wrap(triggerArr, activeMode);
  b.conditions = conditions;
  if (cfg.charges) { b.subRegions = [...(b.subRegions || []), chargesSubtext()]; }
  return b;
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

// ---------- cooldown lists ----------
// TOP row: primary cooldowns + the proc + the Runic Brand debuff tracker
const ICONS_MAIN = [
  { label: 'Runic Brand', spell: 712299, glowWhenReady: true },                      // glows orange when UP (ready)
  { label: 'Runeblade', spell: 'Runeblade', byName: true, glowOnBrand: true,          // detonator, glows@3 stacks
    fallbackIcon: 'Interface\\Icons\\INV_Sword_48' },
  { label: 'Zenith', spell: 712325 },                                                // offensive CD
  { label: 'Primordial Blast', spell: 'Primordial Blast', byName: true,               // main nuke (baseline)
    fallbackIcon: 'Interface\\Icons\\Spell_Fire_Fireball02' },
  { label: 'Fist of the Ancients', spell: 712326 },
  { label: 'Power Overwhelming', proc: 'Power Overwhelming', glowColor: PROC_GLOW,     // proc-only alert
    fallbackIcon: 'Interface\\Icons\\Spell_Shadow_UnholyFrenzy' }
];

// BOTTOM row: defensives / utility
const ICONS_SECONDARY = [
  { label: 'Guarding Rune', spell: 500464 },   // magic-damage barrier
  { label: 'Granite Resolve', spell: 520229 }  // -30% physical damage
];

const mainIcons = ICONS_MAIN.map(c => makeIcon(c, CD_GROUP_ID, ICON_SIZE));
const secIcons = ICONS_SECONDARY.map(c => makeIcon(c, CD2_GROUP_ID, ICON_SIZE_2));

// ---------- dynamicgroup factory (centered, wrapping row) ----------
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
function makeDynGroup(id, uid, children, yOffset, perRow, iconSize) {
  const dg = clone(dgTpl);
  dg.id = id; dg.uid = uid; dg.parent = GROUP_ID;
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

const cdGroup = makeDynGroup(CD_GROUP_ID, 'runicCdGrp1', mainIcons, CD_Y, ICONS_MAIN.length, ICON_SIZE);
const cd2Group = makeDynGroup(CD2_GROUP_ID, 'runicCdGrp2', secIcons, CD2_Y, ICONS_SECONDARY.length, ICON_SIZE_2);

// ---------- main group ----------
const group = clone(grpTpl);
group.id = GROUP_ID; group.uid = 'runicGrp0001';
group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
group.actions = safeActions(); group.conditions = [];
group.anchorFrameType = 'SCREEN'; group.anchorPoint = 'CENTER'; group.selfPoint = 'CENTER';
group.xOffset = 0; group.yOffset = 0;
stripMeta(group);
group.controlledChildren = [cdGroup.id, mana.id, health.id, cd2Group.id];

// flat list of ALL regions
const children = [mana, health, cdGroup, cd2Group, ...mainIcons, ...secIcons];
const top = { d: group, c: children, m: 'd', s: '5.20.2', v: 2000 };

fs.writeFileSync('runemaster-runic-v1.decoded.json', JSON.stringify(top, null, 2));
const str = encodeWA(top);
fs.writeFileSync('runemaster-runic-v1.import.txt', str);
const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
console.log('runic v1 written: runemaster-runic-v1.import.txt (' + str.length + ' chars) | self round-trip:', ok);
console.log('total regions:', children.length, '| primary CDs:', mainIcons.length, '| secondary CDs:', secIcons.length);
