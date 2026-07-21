// WA -> SPEC decompiler: the inverse of lib/spec-builder.js's specToParts, scoped to strings THIS tool
// generated. Takes a decoded export envelope ({ d: rootGroup, c: [regions] }) and reconstructs a SPEC
// document the editor can load. It does NOT need to reproduce the original spec.json text — only a SPEC
// whose specToParts() regenerates the same regions (verified by tools/wa-to-spec-roundtrip.mjs).
//
// Faithful, not guessing: every field is read back from the region shapes the builders emit
// (builders-core.js). Anything this tool never emits is unsupported and throws loudly rather than
// producing a plausible-but-wrong SPEC — notably the composable proc `when` DSL (no in-scope package uses
// it; legacy buff/execute/stealable procs ARE inverted). The spec `name` is not stored in the envelope, so
// it defaults to the id (name never affects the generated regions).
//
// Isomorphic (no fs) so the same module runs in the backend endpoint and, if ever needed, the browser.
const { elementHeight } = require('./spec-builder.js');

// ---- small readers over the emitted region shapes ----
const glowFromChanges = (changes, sub = 3) => {
  const g = {};
  for (const ch of changes || []) {
    if (ch.property === `sub.${sub}.glowColor`) g.color = ch.value.slice();
    if (ch.property === `sub.${sub}.glowType`) g.glowType = ch.value;
  }
  return g;
};
const glowFromSubglow = (region, sub = 3) => {
  const sr = (region.subRegions || [])[sub - 1];   // sub.N is 1-indexed over subRegions
  return sr && sr.glow ? { color: (sr.glowColor || [1, 1, 1, 1]).slice(), glowType: sr.glowType } : {};
};
const num = (v) => (typeof v === 'string' ? Number(v) : v);

// trigger predicates (mirror builders-core.js trigger constructors)
const isCooldown = (t) => t.type === 'spell' && t.event === 'Cooldown Progress (Spell)';
const isAura = (t) => t.type === 'aura2';
const isPower = (t) => t.type === 'unit' && t.event === 'Power';
const isHealth = (t) => t.type === 'unit' && t.event === 'Health';
const isPowerAtLeast = (t) => t.type === 'custom' && /UnitPower\("player"/.test(t.custom || '');
const isTargetExecute = (t) => t.type === 'custom' && /UnitHealth\("target"/.test(t.custom || '');
const isStealable = (t) => isAura(t) && t.use_stealable;
const isAlwaysFull = (t) => t.type === 'custom' && /progressType = "static"/.test(t.custom || '');

const trigs = (region) => (region.triggers.__array || []).map((t) => t.trigger);
const cdSpell = (t) => ({ spell: t.spellName, byName: !t.use_exact_spellName });
const powerAtLeastVals = (t) => ({
  power: Number((t.custom.match(/p >= (\d+)/) || [])[1]),
  powerType: Number((t.custom.match(/UnitPower\("player", (\d+)\)/) || [])[1]),
});
const executePct = (t) => Math.round(Number((t.custom.match(/< ([\d.]+)/) || [])[1]) * 100);

// ---- cooldown / proc / buff-row icon inversion ----

// A cdRow / side-column icon = B.cooldownIcon(cdIconCfg). Recover { label, spell, byName, charges,
// showPowerAbove, powerType, proc, glow }.
function invertCooldownIcon(region, label) {
  const c = { label };
  if (region.displayIcon) c.fallbackIcon = region.displayIcon;
  const ts = trigs(region);
  const conds = region.conditions || [];
  const mode = region.triggers.activeTriggerMode;
  const hasCharges = (region.subRegions || []).some((s) => s.type === 'subtext' && s.text_text === '%s');
  if (hasCharges) c.charges = true;

  // proc-only base (buff show==1, no cooldown trigger)
  if (ts.length === 1 && isAura(ts[0])) {
    c.proc = ts[0].auranames[0];
    c.glow = glowFromChanges((conds[0] || {}).changes);
    return c;
  }
  // glowBuff-duration path (self-buff CD): aura trigger FIRST, cooldown second, first-active display
  if (mode === -10 && isAura(ts[0]) && ts[1] && isCooldown(ts[1])) {
    Object.assign(c, cdSpell(ts[1]));
    const gc = conds.find((cd) => cd.check && cd.check.variable === 'show');
    c.glow = { type: 'buff', buff: ts[0].auranames[0], ...glowFromChanges(gc && gc.changes) };
    return c;
  }
  // base path: [cooldown] or [powerAtLeast, cooldown]
  let cdIdx = 1;
  if (isPowerAtLeast(ts[0])) {
    const pv = powerAtLeastVals(ts[0]);
    c.showPowerAbove = pv.power; c.powerType = pv.powerType; cdIdx = 2;
  }
  Object.assign(c, cdSpell(ts[cdIdx - 1]));

  // the glow condition (if any) is the one that isn't the desaturate rule
  const glowCond = conds.find((cd) => !(cd.changes || []).some((ch) => ch.property === 'desaturate'));
  if (glowCond) {
    const chk = glowCond.check;
    const glow = glowFromChanges(glowCond.changes);
    if (chk.variable === 'AND') {
      const powChk = chk.checks.find((x) => x.variable === 'power');
      c.glow = { type: 'readyPower', power: num(powChk.value), ...glow };
      c.powerType = ts[ts.length - 1].powertype;
    } else if (chk.variable === 'onCooldown') {
      c.glow = { type: 'ready', ...glow };
    } else if (chk.variable === 'percentpower') {
      c.glow = { type: 'powerPct', pct: num(chk.value), ...glow };
      c.powerType = ts[ts.length - 1].powertype;
    } else if (chk.variable === 'percenthealth') {
      c.glow = { type: 'targetHealthBelow', pct: num(chk.value), ...glow };
    } else if (chk.variable === 'buffed') {
      c.glow = { type: 'buffMissing', buff: ts[ts.length - 1].auranames[0], ...glow };
    } else if (chk.variable === 'show') {
      c.glow = { type: 'buff', buff: ts[ts.length - 1].auranames[0], ...glow };
    } else if (chk.variable === 'charges') {
      const extra = ts[ts.length - 1];
      c.glow = { type: 'onCharges', ...cdSpell(extra), op: chk.op, value: num(chk.value), ...glow };
    }
  }
  return c;
}

// The inverse of spec-builder.js clauseToCheck: a condition-check + the trigger it references -> a when-clause.
function checkToClause(chk, ts) {
  const t = ts[chk.trigger - 1];
  switch (chk.variable) {
    case 'buffed':
      if (num(chk.value) === 0) return { buffMissing: t.auranames[0] };
      return t.auranames.length > 1 ? { anyBuff: t.auranames.slice() } : { buff: t.auranames[0] };
    case 'stacks':
      return { buffStacks: { name: t.auranames[0], op: chk.op || '>=', value: num(chk.value) } };
    case 'show':
      if (isTargetExecute(t)) return { targetHpBelow: executePct(t) };
      if (isPowerAtLeast(t)) { const pv = powerAtLeastVals(t); return { powerAtLeast: pv.power, powerType: pv.powerType }; }
      if (isStealable(t)) return { stealable: true };
      if (isAura(t)) return t.auranames.length > 1 ? { anyBuff: t.auranames.slice() } : { buff: t.auranames[0] };
      break;
    case 'onCooldown': return { spellReady: true };
    case 'charges': return { charges: { op: chk.op || '>=', value: num(chk.value) } };
    case 'percentpower': return { powerPctAtLeast: num(chk.value), powerType: t.powertype };
  }
  throw new Error(`checkToClause: unhandled check (variable "${chk.variable}")`);
}
const decompose = (check) => (check.variable === 'AND' ? check.checks : [check]);

// A unified iconRow / side-rail icon = spec-builder.js iconElement. Recover
// { label, spell, byName, fallbackIcon, charges, showWhen[], hide, glow{color,glowType,when[]}, display }.
// showWhen absent = always-visible (cd-like). Mirror of iconElement's slot / collapse / always-visible shapes.
function invertIconElement(region, label) {
  const c = { label };
  if (region.displayIcon) c.fallbackIcon = region.displayIcon;
  const ts = trigs(region);
  const conds = region.conditions || [];
  const mode = region.triggers.activeTriggerMode;
  const collapse = region.triggers.disjunctive === 'all';

  const cdPos = ts.findIndex(isCooldown);
  const cdIdx = cdPos >= 0 ? cdPos + 1 : 0;
  if (cdIdx) Object.assign(c, cdSpell(ts[cdPos]));
  if ((region.subRegions || []).some((s) => s.type === 'subtext' && s.text_text === '%s')) c.charges = true;

  const desatCond = conds.find((cd) => (cd.changes || []).length === 1 && cd.changes[0].property === 'desaturate');
  const showCond = conds.find((cd) => (cd.changes || []).some((ch) => ch.property === 'alpha'));
  const glowCond = conds.find((cd) => cd !== showCond && (cd.changes || []).some((ch) => /^sub\.3\.glow/.test(ch.property)));
  const staticGlow = glowFromSubglow(region);

  // glow: an explicit glow condition, else glow folded into the show condition (glow whenever shown), else static
  let glow = null, glowChecks = [];
  if (glowCond) { glow = glowFromChanges(glowCond.changes); glowChecks = decompose(glowCond.check); }
  else if (showCond && (showCond.changes || []).some((ch) => /^sub\.3\.glow/.test(ch.property))) glow = glowFromChanges(showCond.changes);
  else if (Object.keys(staticGlow).length) glow = staticGlow;

  // showWhen: slot mode reads the alpha condition; collapse reads the non-cd/non-glow gating triggers
  let showWhen = null, showChecks = [];
  if (showCond) {
    showChecks = decompose(showCond.check);
    showWhen = showChecks.map((chk) => checkToClause(chk, ts));
  } else if (collapse) {
    const glowTrigIdx = new Set(glowChecks.map((chk) => chk.trigger));
    showWhen = ts.map((_, i) => i + 1).filter((idx) => idx !== cdIdx && !glowTrigIdx.has(idx))
      .map((idx) => checkToClause({ trigger: idx, variable: 'show', value: 1 }, ts));
  }
  const gated = showWhen !== null;

  // glow.when = the glow AND-checks that aren't already show-checks (slot); all of them otherwise
  if (glow && glowChecks.length) {
    const showKeys = new Set((gated && !collapse ? showChecks : []).map((x) => JSON.stringify(x)));
    const extra = glowChecks.filter((x) => !showKeys.has(JSON.stringify(x)));
    if (extra.length) glow.when = extra.map((chk) => checkToClause(chk, ts));
  }

  if (showWhen) { c.showWhen = showWhen; if (collapse) c.hide = 'collapse'; }
  if (glow) c.glow = glow;

  const display = {};
  const desatDefault = !gated && cdIdx !== 0;
  if (!!desatCond !== desatDefault) display.desaturateOnCd = !!desatCond;
  if (region.cooldown === false) display.timer = 'none';
  else if (cdIdx && mode !== cdIdx) display.timer = 'buff';
  if (region.cooldownTextDisabled) display.cooldownNumbers = false;
  if (Object.keys(display).length) c.display = display;
  return c;
}

// A procRow icon — legacy variants only (buff / execute / stealable). The composable `when` DSL is not
// inverted (no in-scope package uses it): a proc that doesn't match one of these throws.
function invertProcIcon(region, label) {
  const c = { label };
  if (region.displayIcon) c.fallbackIcon = region.displayIcon;
  const ts = trigs(region);
  const mode = region.triggers.activeTriggerMode;

  if (ts.length === 1 && isAura(ts[0]) && ts[0].use_stealable) {
    c.stealable = true;
    Object.assign(c, glowFromChanges((region.conditions[0] || {}).changes));
    return c;
  }
  if (ts[0] && isTargetExecute(ts[0]) && ts[1] && isCooldown(ts[1])) {
    c.execute = executePct(ts[0]);
    Object.assign(c, cdSpell(ts[1]));
    if (mode === 1) {   // glowAlways: static subglow + no cooldown number
      c.glowAlways = true;
      Object.assign(c, glowFromSubglow(region));
    } else {
      const gc = (region.conditions || []).find((cd) => (cd.changes || []).some((ch) => ch.property === 'sub.3.glow'));
      Object.assign(c, glowFromChanges(gc && gc.changes));
    }
    return c;
  }
  if (ts[0] && isCooldown(ts[0]) && ts[1] && isAura(ts[1])) {
    Object.assign(c, cdSpell(ts[0]));
    c.buff = ts[1].auranames[0];
    Object.assign(c, glowFromChanges((region.conditions[0] || {}).changes));
    return c;
  }
  throw new Error(`proc "${label}": unsupported shape (only legacy buff/execute/stealable procs can be imported)`);
}

// A buffRow icon (anyOf / weaponEnchant / indicator + lowPowerGlow).
function invertBuffRowIcon(region, label) {
  const c = { label };
  if (region.displayIcon) c.fallbackIcon = region.displayIcon;
  const ts = trigs(region);
  const t0 = ts[0];
  if (t0.type === 'item' && t0.event === 'Weapon Enchant') { c.weaponEnchant = t0.weapon; return c; }
  if (isAura(t0) && t0.matchesShowOn === 'showOnActive') { c.anyOf = t0.auranames.slice(); return c; }
  if (isAura(t0)) {   // indicator (showAlways, desaturate while missing)
    c.indicator = t0.auranames[0];
    const lp = (region.conditions || []).find((cd) => cd.check && cd.check.variable === 'percentpower');
    if (lp) {
      const glow = glowFromChanges(lp.changes);
      c.lowPowerGlow = { pct: num(lp.check.value), powerType: ts[1].powertype, color: glow.color, glowType: glow.glowType };
    }
    return c;
  }
  throw new Error(`buffRow icon "${label}": unsupported shape`);
}

// strip "<specId> <infix> - <label>" / "<specId> - <label>" -> label
const labelOf = (id, specId, infix) => id.slice(`${specId} ${infix ? infix + ' - ' : '- '}`.length);

// ---- bar / stack element inversion (each returns a SPEC stack element) ----
function invertBar(region, specId) {
  const ts = trigs(region);
  const t0 = ts[0];
  const sub = (region.subRegions || []).find((s) => s.type === 'subtext');
  const barText = sub ? sub.text_text : '%p';

  // warn text: fully transparent bar carrying a warning subtext, toggled by buffed==0
  if (Array.isArray(region.barColor) && region.barColor[3] === 0 && isAura(t0)) {
    return { kind: 'buffWarnText', id: region.id, buff: t0.auranames[0], text: sub.text_text,
      fontSize: sub.text_fontSize, color: sub.text_color.slice(), height: region.height, width: region.width };
  }
  // uptime bar: aura trigger + expirationTime coloring + warn/glow subRegions
  if (isAura(t0) && (region.conditions || []).some((cd) => cd.check && cd.check.variable === 'expirationTime')) {
    const warn = (region.subRegions || []).find((s) => s.type === 'subtext' && !s.text_visible);
    return { kind: 'uptimeBar', id: region.id, height: region.height,
      buff: t0.auranames.length > 1 ? t0.auranames.slice() : t0.auranames[0],
      // unit is emitted only for a target-debuff uptime bar, so a self-buff bar re-generates byte-identically.
      ...(t0.unit === 'target' ? { unit: 'target' } : {}),
      label: sub.text_text, warnText: warn ? warn.text_text : '', bg: region.backgroundColor.slice() };
  }
  // stack bar (aura stack count as a resource): progressSource stacks + pinned max
  if (isAura(t0) && Array.isArray(region.progressSource) && region.progressSource[1] === 'stacks') {
    return { kind: 'stackBar', id: region.id, aura: t0.auranames[0], max: Number(region.adjustedMax),
      debuffType: t0.debuffType, hi: region.barColor.slice(), lo: region.barColor2.slice(),
      bg: region.backgroundColor.slice(), height: region.height, width: region.width, text: barText };
  }
  if (isPower(t0)) {
    return { kind: 'powerBar', id: region.id, powerType: t0.powertype, hi: region.barColor.slice(),
      lo: region.barColor2.slice(), bg: region.backgroundColor.slice(), width: region.width,
      height: region.height, text: barText, textSize: sub ? sub.text_fontSize : 11 };
  }
  if (isHealth(t0)) {
    return { kind: 'healthBar', id: region.id, unit: t0.unit, hi: region.barColor.slice(),
      lo: region.barColor2.slice(), bg: region.backgroundColor.slice(), height: region.height, text: barText };
  }
  throw new Error(`bar "${region.id}": unrecognized aurabar shape`);
}

// A run of consecutive segment boxes -> one stacks / chargeStacks element.
function invertStacks(boxes, specId) {
  const first = boxes[0];
  const ts = trigs(first);
  const base = first.id.replace(/ \d+$/, '');
  const gap = boxes.length > 1 ? Math.round((boxes[1].xOffset - first.xOffset) - first.width) : 4;
  const fill = (first.conditions[0] || {}).changes || [];
  const hi = (fill.find((ch) => ch.property === 'barColor') || {}).value;
  const lo = (fill.find((ch) => ch.property === 'barColor2') || {}).value;
  const common = { id: base, count: boxes.length, gap, height: first.height,
    hi: hi && hi.slice(), lo: lo && lo.slice(), emptyBg: first.backgroundColor.slice() };
  if (isCooldown(ts[0])) {   // chargeStacks (spell charges)
    return { kind: 'chargeStacks', spell: ts[0].spellName, byName: !ts[0].use_exact_spellName, ...common };
  }
  const el = { kind: 'stacks', auraNames: ts[0].auranames.slice(), unit: ts[0].unit,
    debuffType: ts[0].debuffType, unitExists: ts[0].unitExists, ...common };
  // capGlow: an extra condition that turns on sub.5 glow when stacks reach the cap
  const cap = (first.conditions || []).find((cd) => (cd.changes || []).some((ch) => ch.property === 'sub.5.glow'));
  if (cap) {
    const g = glowFromChanges(cap.changes, 5);
    const checks = cap.check.variable === 'AND' ? cap.check.checks : [cap.check];
    const stackChk = checks.find((x) => x.variable === 'stacks');
    const buffChk = checks.find((x) => x.variable === 'buffed');
    el.capGlow = { at: Number(stackChk.value), color: g.color, glowType: g.glowType };
    if (buffChk) el.capGlow.unlessBuff = ts[2].auranames[0];
  }
  return el;
}

// A dynamicgroup in the central stack -> procRow / buffRow / cdRow.
function invertRow(dg, byId, specId) {
  const iconIds = dg.controlledChildren || [];
  const icons = iconIds.map((id) => byId.get(id));
  const first = iconIds[0] || '';
  // unified iconRow: every icon id is prefixed by the row's dynamicgroup id (`${dg.id} - <label>`)
  const pfx = `${dg.id} - `;
  if (iconIds.length && iconIds.every((id) => id.startsWith(pfx))) {
    const el = { kind: 'iconRow', id: dg.id, size: icons[0].width,
      icons: icons.map((r) => invertIconElement(r, r.id.slice(pfx.length))) };
    if (/\(Secondary\)$/.test(dg.id)) el.secondary = true;
    // per-row overrides: iconGap (dg.space), perRow (customGrow Lua), combatOnly (dg load). perRow / _rowCombat
    // are resolved against the recovered barWidth / global combat flag in waToSpec's post-pass.
    if (dg.space != null && dg.space !== 4) el.iconGap = dg.space;
    const pr = /local perRow = (\d+)/.exec(dg.customGrow || '');
    if (pr) el.perRow = Number(pr[1]);
    if (dg.load && dg.load.use_combat) el._rowCombat = true;
    return el;
  }
  if (first.startsWith(`${specId} Proc - `)) {
    return { kind: 'procRow', id: dg.id, size: icons[0].width,
      icons: icons.map((r) => invertProcIcon(r, labelOf(r.id, specId, 'Proc'))) };
  }
  if (first.startsWith(`${specId} Buff - `)) {
    return { kind: 'buffRow', id: dg.id, size: icons[0].width,
      icons: icons.map((r) => invertBuffRowIcon(r, labelOf(r.id, specId, 'Buff'))) };
  }
  const el = { kind: 'cdRow', id: dg.id, size: icons[0].width,
    icons: icons.map((r) => invertCooldownIcon(r, labelOf(r.id, specId))) };
  if (/\(Secondary\)$/.test(dg.id)) el.secondary = true;
  return el;
}

// dynamicgroup with a vertical (single-column) grow = a side rail; else a central row.
const isColumn = (dg) => dg.regionType === 'dynamicgroup' && !/local perRow/.test(dg.customGrow || '');

function invertColumn(dg, byId, specId, gx, gy) {
  const iconIds = dg.controlledChildren || [];
  const icons = iconIds.map((id) => byId.get(id));
  const pfx = `${dg.id} - `;
  const canonical = iconIds.length && iconIds.every((id) => id.startsWith(pfx));
  const col = { id: dg.id, xOffset: dg.xOffset - gx, size: icons[0].width,
    icons: icons.map((r) => canonical ? invertIconElement(r, r.id.slice(pfx.length)) : invertCooldownIcon(r, labelOf(r.id, specId))) };
  if (dg.yOffset !== gy) col.yOffset = dg.yOffset;
  return col;
}

// a segment box = transparent bar whose only condition paints a gradient fill at >= index
const isSegmentBox = (r) => r.regionType === 'aurabar' && Array.isArray(r.barColor) && r.barColor[3] === 0 &&
  (r.conditions || []).some((cd) => (cd.changes || []).some((ch) => ch.property === 'enableGradient'));
const sameRun = (r, first) => isSegmentBox(r) && r.id.replace(/ \d+$/, '') === first.id.replace(/ \d+$/, '');

// ---- top-level ----
// The layout engine (specToParts) centers the stack on g.yOffset, deriving each element's center from the
// element heights + g.gap. To make specToParts regenerate the same yOffsets we recover g.barWidth (needed
// for row wrapping = height), then g.gap and g.yOffset from the observed element centers via the SAME
// elementHeight() the builder uses (no duplicated layout maths).
function waToSpec(top) {
  const group = top.d, children = top.c || [];
  if (!group || group.regionType !== 'group') throw new Error('not a WeakAuras group export (no root group)');
  const specId = group.id;
  const byId = new Map(children.map((r) => [r.id, r]));

  const order = group.controlledChildren || [];
  const rootRegions = order.map((id) => byId.get(id));
  const gx = (rootRegions[0] || {}).xOffset || 0;

  // 1. central-stack elements (segment-box runs coalesced) + their observed center y; columns handled after
  const spec = { id: specId, name: specId, global: {}, stack: [] };
  const centers = [];
  for (let i = 0; i < rootRegions.length; i++) {
    const r = rootRegions[i];
    if (isColumn(r)) continue;
    if (r.regionType === 'dynamicgroup') {
      spec.stack.push(invertRow(r, byId, specId)); centers.push(r.yOffset); continue;
    }
    if (/ \d+$/.test(r.id) && isSegmentBox(r)) {
      const run = [r];
      while (i + 1 < rootRegions.length && sameRun(rootRegions[i + 1], r)) run.push(rootRegions[++i]);
      spec.stack.push(invertStacks(run, specId)); centers.push(r.yOffset); continue;
    }
    spec.stack.push(invertBar(r, specId)); centers.push(r.yOffset);
  }

  // 2. global geometry. barWidth: healthBar.width is the ground truth (healthBar never overrides it); else
  // any bar's width; else the default. Then heights via the builder's elementHeight, then gap + yOffset.
  const health = spec.stack.find((e) => e.kind === 'healthBar');
  const barEl = spec.stack.find((e) => e.width != null);
  const barWidth = health ? byId.get(health.id).width : (barEl ? barEl.width : 250);
  spec.global.barWidth = barWidth;
  const g = { barWidth, iconSize: 26, secIconSize: 24, procSize: 30 };
  const heights = spec.stack.map((el) => elementHeight(el, g));
  let gap = 3;
  if (centers.length > 1) gap = Math.round(centers[0] - centers[1] - heights[0] / 2 - heights[1] / 2);
  const H = heights.reduce((a, b) => a + b, 0) + gap * (heights.length - 1);
  const gy = heights.length ? Math.round(centers[0] - H / 2 + heights[0] / 2) : 0;
  if (gx) spec.global.xOffset = gx;
  if (gy) spec.global.yOffset = gy;
  if (gap !== 3) spec.global.gap = gap;

  // 3. side columns (root order: left then right), placed relative to the recovered gx/gy
  for (const dg of rootRegions.filter(isColumn)) {
    if (dg.xOffset < gx) spec.left = invertColumn(dg, byId, specId, gx, gy);
    else spec.right = invertColumn(dg, byId, specId, gx, gy);
  }

  const globalCombat = !!(group.load && group.load.use_combat);
  if (globalCombat) spec.combatOnly = true;
  // resolve per-row overrides that needed the recovered barWidth / global combat flag: drop a perRow that just
  // equals the maxWidth-derived default (it was not an override), and a per-row combatOnly already covered globally.
  for (const el of spec.stack) {
    if (el.kind !== 'iconRow') continue;
    if (el.perRow != null) {
      const hs = el.iconGap != null ? el.iconGap : 4;
      const def = Math.max(1, Math.floor((barWidth + hs) / (el.size + hs)));
      if (el.perRow === def) delete el.perRow;
    }
    if (el._rowCombat) { if (!globalCombat) el.combatOnly = true; delete el._rowCombat; }
  }
  return spec;
}

module.exports = { waToSpec };
