// Data-driven package builder — the keystone for the webapp. Turns a declarative SPEC document
// (which the web UI will edit) into a WeakAuras import string, so the imperative per-class build.js
// (hand-computed yOffsets + hand-listed wiring) is no longer needed.
//
// It does two things the class files did by hand:
//   1. LAYOUT ENGINE — the central `stack` is a top->bottom list of elements; each element has an
//      intrinsic height, and this derives every yOffset (centering the whole stack on global.yOffset).
//   2. AUTO-WIRING   — one pass builds all regions, then derives the root group's controlledChildren
//      (top-level display order) and the flat children[] array. No more parallel id lists to keep in sync.
//
// Vocabulary (mirrors the CLAUDE.md element taxonomy; each kind clones a recipe validated in-game):
//   procRow (composable `when` clause DSL, + legacy buff proc / execute proc / stealable indicator),
//   cdRow (cooldownIcon + one glow rule),
//   buffRow (anyOf / weaponEnchant / indicator), powerBar, stackBar (aura-stack resource), healthBar,
//   uptimeBar, stacks (+capGlow), chargeStacks, buffWarnText, + optional side columns (left/right).
// Browser-safe: uses only the isomorphic builders (builders-core, no fs). The Node writer
// (specToPackage = specToParts + buildPackage + dist write) lives in lib/spec-node.js.
const B = require('./builders-core.js');

const WHITE = [1, 1, 1, 1];

// ---- glow mapping: SPEC glow -> B.cooldownIcon cfg (see builders.js cooldownIcon) ----
function applyGlow(cfg, g) {
  if (!g) return cfg;
  cfg.glowColor = g.color || WHITE;
  cfg.glowType = g.glowType || 'buttonOverlay';
  switch (g.type) {
    case 'buff': cfg.glowBuff = g.buff; break;
    case 'buffMissing': cfg.glowBuffMissing = g.buff; break;
    case 'ready': cfg.glowReady = true; break;
    case 'readyPower': cfg.glowReadyPower = g.power; break;
    case 'powerPct': cfg.glowPowerPct = g.pct; break;
    case 'targetHealthBelow': cfg.glowTargetHealthBelow = g.pct; break;
    case 'onCharges': cfg.glowOnCharges = { spell: g.spell, byName: g.byName, op: g.op, value: g.value, color: g.color || WHITE, glowType: g.glowType }; break;
    default: throw new Error(`unknown glow.type "${g.type}"`);
  }
  return cfg;
}
function cdIconCfg(spec, c, parentId, size) {
  const cfg = {
    id: `${spec.id} - ${c.label}`, parentId, size,
    spell: c.spell, byName: c.byName, charges: c.charges, fallbackIcon: c.fallbackIcon,
    showPowerAbove: c.showPowerAbove, powerType: c.powerType,
  };
  if (c.proc) {   // proc-only icon (see cooldownIcon): appears + glows only while the buff is active
    cfg.proc = c.proc;
    cfg.glowColor = (c.glow && c.glow.color) || WHITE;
    cfg.glowType = (c.glow && c.glow.glowType) || 'buttonOverlay';
    return cfg;
  }
  return applyGlow(cfg, c.glow);
}

// ---- composable proc DSL (procRow icons with a `when` array) ----
// A proc = an icon + AND-ed `when` clauses controlling when it lights up, an optional glow (with its own
// extra clauses in glow.when), and display options:
//   { label, spell?, byName?, fallbackIcon?,
//     when: [clause...],                   // ALL must pass
//     hide?: 'slot' | 'collapse',          // slot (default): alpha 0, keeps its slot in the row
//                                          // collapse: triggers drive show, the row recenters (legacy execute shape)
//     glow?: { color?, glowType?, when?: [clause...] },   // glow.when empty/absent = glow whenever the when[] passes
//     display?: { timer?: 'cooldown'|'buff'|'none', stacks?: true, cooldownNumbers?: false, desaturateOnCd?: true } }
// Clauses (exactly ONE key each — all trigger/variable shapes are validated in-game or present in the
// Luxthos reference packages, incl. `show` checks on custom stateupdate triggers and `%N.s` subtexts):
//   { buff: name } / { buffMissing: name } / { anyBuff: [names] }
//   { buffStacks: { name, op?, value } }         (op defaults '>=')
//   { targetHpBelow: pct }                       (custom UnitHealth — built-in % filter doesn't gate here)
//   { powerAtLeast: N, powerType? }              (custom UnitPower — same reason; powerType defaults 3)
//   { spellReady: true } / { charges: { op?, value } }   (read the icon's own cooldown trigger)
//   { stealable: true }                          (target has ANY spell-stealable buff)
const GATING_CLAUSES = new Set(['buff', 'anyBuff', 'targetHpBelow', 'powerAtLeast', 'stealable']);  // can drive show ('collapse')
const AURA_CLAUSES = new Set(['buff', 'anyBuff', 'buffStacks']);   // buff-family (drives timer:'buff' + the stacks subtext)
const ALL_CLAUSES = new Set([...GATING_CLAUSES, ...AURA_CLAUSES, 'buffMissing', 'spellReady', 'charges']);
function clauseKind(cl, at) {
  const keys = [...ALL_CLAUSES].filter(k => cl[k] !== undefined);
  if (keys.length !== 1) throw new Error(`${at}: each when-clause needs exactly one of ${[...ALL_CLAUSES].join(', ')}`);
  return keys[0];
}

function whenProcIcon(spec, c, parentId, size) {
  const at = `proc "${c.label}"`;
  const collapse = (c.hide || 'slot') === 'collapse';
  const d = c.display || {};
  const b = B.iconBase(parentId, { id: `${spec.id} Proc - ${c.label}`, parentId, size, fallbackIcon: c.fallbackIcon });

  // triggers are deduped by shape so `when` and `glow.when` clauses on the same buff share one trigger
  const triggerArr = [], trigIdx = new Map();
  const addTrigger = (def) => {
    const k = JSON.stringify(def);
    if (!trigIdx.has(k)) { triggerArr.push(B.T(def)); trigIdx.set(k, triggerArr.length); }
    return trigIdx.get(k);
  };
  const cdIdx = c.spell != null ? addTrigger(B.cooldownTrigger(c.spell, c.byName)) : 0;

  let auraIdx = 0;   // first buff-family trigger (timer:'buff' + stacks subtext read it)
  const checkFor = (cl) => {
    switch (clauseKind(cl, at)) {
      case 'buff': {
        // slot: showAlways (always active, read `buffed`); collapse: showOnActive drives show
        const idx = addTrigger(B.buffTrigger(cl.buff, collapse ? undefined : 'showAlways'));
        if (!auraIdx) auraIdx = idx;
        return collapse ? { trigger: idx, variable: 'show', value: 1 } : { trigger: idx, variable: 'buffed', value: 1 };
      }
      case 'anyBuff': {
        const idx = addTrigger(B.anyBuffTrigger(cl.anyBuff, collapse ? 'showOnActive' : 'showAlways'));
        if (!auraIdx) auraIdx = idx;
        return collapse ? { trigger: idx, variable: 'show', value: 1 } : { trigger: idx, variable: 'buffed', value: 1 };
      }
      case 'buffMissing':
        return { trigger: addTrigger(B.buffTrigger(cl.buffMissing, 'showAlways')), variable: 'buffed', value: 0 };
      case 'buffStacks': {
        const s = cl.buffStacks;
        const idx = addTrigger(B.buffTrigger(s.name, 'showAlways'));
        if (!auraIdx) auraIdx = idx;
        return { op: s.op || '>=', trigger: idx, variable: 'stacks', value: String(s.value) };
      }
      case 'targetHpBelow':
        return { trigger: addTrigger(B.targetExecuteTrigger(cl.targetHpBelow)), variable: 'show', value: 1 };
      case 'powerAtLeast':
        return { trigger: addTrigger(B.powerAtLeastTrigger(cl.powerAtLeast, cl.powerType != null ? cl.powerType : 3)), variable: 'show', value: 1 };
      case 'stealable':
        return { trigger: addTrigger(B.stealableTargetTrigger()), variable: 'show', value: 1 };
      case 'spellReady':
        return { trigger: cdIdx, variable: 'onCooldown', value: 0 };
      case 'charges':
        return { op: cl.charges.op || '>=', trigger: cdIdx, variable: 'charges', value: String(cl.charges.value) };
    }
  };
  const AND = (checks) => checks.length > 1 ? { checks, trigger: -2, variable: 'AND' } : checks[0];

  const whenChecks = c.when.map(checkFor);   // in collapse mode this still registers the triggers
  const glow = c.glow;
  const glowChecks = (glow && Array.isArray(glow.when)) ? glow.when.map(checkFor) : [];

  const conditions = [];
  if (cdIdx && d.desaturateOnCd) {
    conditions.push({ check: { trigger: cdIdx, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] });
  }
  if (collapse) {
    // visibility handled by the show-driving triggers (disjunctive 'all'); glow is static while shown,
    // or conditional on the extra glow.when clauses
    if (glow && !glowChecks.length) {
      for (const sr of b.subRegions) {
        if (sr.type === 'subglow') { sr.glow = true; sr.glowType = glow.glowType || 'buttonOverlay'; sr.useGlowColor = true; sr.glowColor = (glow.color || WHITE).slice(); }
      }
    } else if (glow) {
      conditions.push({ check: AND(glowChecks), changes: B.glowChanges(glow.color || WHITE, glow.glowType) });
    }
  } else {
    b.alpha = 0;
    const showChanges = [{ property: 'alpha', value: 1 }];
    if (glow && !glowChecks.length) showChanges.push(...B.glowChanges(glow.color || WHITE, glow.glowType));
    conditions.push({ check: AND(whenChecks), changes: showChanges });
    if (glow && glowChecks.length) {
      conditions.push({ check: AND([...whenChecks, ...glowChecks]), changes: B.glowChanges(glow.color || WHITE, glow.glowType) });
    }
  }

  let mode = cdIdx || 1;                     // display trigger: the cooldown by default (spell art + swipe)
  if (d.timer === 'buff') mode = auraIdx;    // swipe/countdown = the proc buff's remaining time
  if (d.timer === 'none') b.cooldown = false;
  b.triggers = B.wrap(triggerArr, mode);
  if (collapse) b.triggers.disjunctive = 'all';   // 'any' would show the icon permanently (cd trigger is always active)
  b.conditions = conditions;
  if (d.stacks) b.subRegions = [...b.subRegions, B.stacksSubtext(auraIdx)];
  if (d.cooldownNumbers === false) b.cooldownTextDisabled = true;
  return b;
}

// validation for a when-DSL proc icon (loud, before building any region)
function validateWhenProc(ic, at, need) {
  need(Array.isArray(ic.when) && ic.when.length, 'needs a non-empty when[]');
  if (ic.hide) need(ic.hide === 'slot' || ic.hide === 'collapse', `unknown hide "${ic.hide}" (slot | collapse)`);
  const kinds = ic.when.map(cl => clauseKind(cl, at));
  const glowKinds = (ic.glow && Array.isArray(ic.glow.when)) ? ic.glow.when.map(cl => clauseKind(cl, at)) : [];
  for (const cl of [...ic.when, ...((ic.glow && ic.glow.when) || [])]) {
    const k = clauseKind(cl, at);
    if (k === 'buffStacks') need(cl.buffStacks && cl.buffStacks.name && cl.buffStacks.value != null, 'buffStacks needs { name, value }');
    if (k === 'charges') need(cl.charges && cl.charges.value != null, 'charges needs { value }');
    if (k === 'anyBuff') need(Array.isArray(cl.anyBuff) && cl.anyBuff.length, 'anyBuff needs a non-empty [names]');
  }
  const d = ic.display || {};
  if (ic.spell == null) {
    need(![...kinds, ...glowKinds].some(k => k === 'spellReady' || k === 'charges'), 'spellReady/charges clauses need a spell');
    need(!d.desaturateOnCd && d.timer !== 'cooldown', 'display.desaturateOnCd / timer "cooldown" need a spell');
  }
  if (ic.hide === 'collapse') {
    for (const k of kinds) need(GATING_CLAUSES.has(k), `clause "${k}" cannot gate show — use hide "slot" (collapse allows: ${[...GATING_CLAUSES].join(', ')})`);
  } else {
    need(ic.spell != null || kinds.some(k => AURA_CLAUSES.has(k) || k === 'buffMissing'),
      'hide "slot" needs a spell or a buff-family clause (something must keep the icon active to hold its slot)');
  }
  if (d.timer) need(['cooldown', 'buff', 'none'].includes(d.timer), `unknown display.timer "${d.timer}"`);
  if (d.timer === 'buff') need(kinds.some(k => AURA_CLAUSES.has(k)), 'display.timer "buff" needs a buff/anyBuff/buffStacks clause in when[]');
}

// A proc icon, three variants (mirrors classes/felsworn/build.js — Fel Fireball / Tyrant's Gaze / Consume Magic):
//  - buff proc (c.buff): hidden (alpha 0) until the buff is up, then fades in + glows. Art comes from the
//    cooldown trigger's fallback texture (by-name spell doesn't resolve on this client).
//  - execute proc (c.execute = pct): targetExecuteTrigger controls show, so the icon only exists while the
//    target is under pct% HP; trigger 2 supplies the spell art + cooldown swipe (iconSource 2,
//    activeTriggerMode 2). Desaturated while on cooldown, glows when ready.
//  - stealable indicator (c.stealable): shown only while the target has ANY spell-stealable buff (the
//    trigger's showOnActive drives show/hide); iconSource -1 pulls the matched buff's own icon; glows.
function procIcon(spec, c, parentId, size) {
  if (c.when) return whenProcIcon(spec, c, parentId, size);   // the composable DSL (see above)
  const b = B.iconBase(parentId, { id: `${spec.id} Proc - ${c.label}`, parentId, size, fallbackIcon: c.fallbackIcon });
  const glow = B.glowChanges(c.glowColor || WHITE, c.glowType || 'buttonOverlay');
  if (c.stealable) {
    b.triggers = B.wrap([B.T(B.stealableTargetTrigger())], 1);
    b.conditions = [{ check: { trigger: 1, variable: 'show', value: 1 }, changes: glow }];
  } else if (c.execute != null) {
    b.iconSource = 2;
    // glowAlways (barbarian Decapitate): permanent glow while shown (the execute window IS the cue), no
    // cooldown number; the cooldown trigger only drives desaturation. Default (felsworn Tyrant's Gaze):
    // the cooldown trigger drives the display (activeTriggerMode 2 -> swipe + countdown), glow when ready.
    b.triggers = B.wrap([B.T(B.targetExecuteTrigger(c.execute)), B.T(B.cooldownTrigger(c.spell, c.byName))], c.glowAlways ? 1 : 2);
    // 'all', NOT 'any': the cooldown trigger is always active, so 'any' would show the icon permanently.
    b.triggers.disjunctive = 'all';
    if (c.glowAlways) {
      b.cooldownTextDisabled = true;
      for (const sr of b.subRegions) {
        if (sr.type === 'subglow') { sr.glow = true; sr.glowType = c.glowType || 'buttonOverlay'; sr.useGlowColor = true; sr.glowColor = (c.glowColor || WHITE).slice(); }
      }
      b.conditions = [
        { check: { trigger: 2, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] },
      ];
    } else {
      b.conditions = [
        { check: { trigger: 2, variable: 'onCooldown', value: 1 }, changes: [{ property: 'desaturate', value: true }] },
        { check: { trigger: 2, variable: 'onCooldown', value: 0 }, changes: glow },
      ];
    }
  } else {
    b.alpha = 0;
    b.triggers = B.wrap([B.T(B.cooldownTrigger(c.spell, c.byName)), B.T(B.buffTrigger(c.buff, 'showAlways'))], 1);
    b.conditions = [{
      check: { trigger: 2, variable: 'buffed', value: 1 },
      changes: [{ property: 'alpha', value: 1 }, ...glow],
    }];
  }
  return b;
}

// A buff-row icon, three variants (mirrors classes/runemaster/build.js — tattoo / engravings / water reminder):
//  - anyOf ([names]): shown only while ANY of the buffs is up (showOnActive); iconSource -1 shows the
//    matched buff's own icon (e.g. whichever Runic Tattoo is active).
//  - weaponEnchant ('main'|'off'): the currently-active temporary weapon enchant (engraving), with the
//    element letter (%c custom text) as a subtext.
//  - indicator (buffName): always shown; desaturated + dimmed while the buff is missing. Optional
//    lowPowerGlow { pct, powerType?, color?, glowType? } = strong glow when power% drops to pct ("swap now").
function buffRowIcon(spec, c, parentId, size) {
  const b = B.iconBase(parentId, { id: `${spec.id} Buff - ${c.label}`, parentId, size, fallbackIcon: c.fallbackIcon });
  if (c.anyOf) {
    b.triggers = B.wrap([B.T(B.anyBuffTrigger(c.anyOf, 'showOnActive'))], 1);
    b.conditions = [];
  } else if (c.weaponEnchant) {
    b.triggers = B.wrap([B.T(B.weaponEnchantTrigger(c.weaponEnchant))], 1);
    b.conditions = [];
    B.withEngravingLetter(b);
  } else if (c.indicator) {
    b.triggers = B.wrap([B.T(B.buffTrigger(c.indicator, 'showAlways'))], 1);
    b.conditions = [
      { check: { trigger: 1, variable: 'buffed', value: 0 },
        changes: [{ property: 'desaturate', value: true }, { property: 'alpha', value: 0.5 }] },
    ];
    if (c.lowPowerGlow) {
      const lp = c.lowPowerGlow;
      b.triggers.__array.push(B.T(B.powerTrigger(lp.powerType != null ? lp.powerType : 0)));
      b.conditions.push({
        check: { trigger: 2, variable: 'percentpower', op: '<=', value: String(lp.pct) },
        changes: B.glowChanges(lp.color || WHITE, lp.glowType || 'buttonOverlay'),
      });
    }
  } else {
    throw new Error(`buffRow icon "${c.label}": needs one of anyOf / weaponEnchant / indicator`);
  }
  return b;
}

// ---- height of one stack element (drives the layout) ----
function elementHeight(el, g) {
  switch (el.kind) {
    case 'powerBar':
    case 'healthBar':
    case 'stackBar':
    case 'uptimeBar': return el.height || 14;
    case 'stacks':
    case 'chargeStacks': return el.height || 12;
    case 'buffWarnText': return el.height || 22;
    case 'procRow': {
      const size = el.size || g.procSize || 30;
      return rowHeight(el.icons.length, size, g.barWidth);
    }
    case 'buffRow':
    case 'cdRow': {
      const size = el.size || (el.secondary ? g.secIconSize : g.iconSize);
      return rowHeight(el.icons.length, size, g.barWidth);
    }
    default: throw new Error(`unknown stack element kind "${el.kind}"`);
  }
}
// icons wrap at maxWidth (matches makeDynGroup/customGrowLua: hSpace = 4)
function rowHeight(count, size, maxWidth) {
  const perRow = Math.max(1, Math.floor((maxWidth + 4) / (size + 4)));
  const rows = Math.max(1, Math.ceil(count / perRow));
  return rows * size + (rows - 1) * 4;
}

// ---- build the regions for one stack element, given its assigned center y ----
// returns { rootIds: [...ids shown directly by the root group], regions: [...all regions to emit] }
function buildElement(spec, el, centerY, g, gx) {
  switch (el.kind) {
    case 'powerBar': {
      const bar = B.baseBar(spec.id, el.id || `${spec.id} Power`);
      bar.width = el.width || g.barWidth; bar.height = el.height || 14;
      B.gradient(bar, el.hi, el.lo);
      bar.backgroundColor = (el.bg || [0.1, 0.1, 0.1, 0.8]).slice();
      bar.triggers = B.wrap([B.T(B.powerTrigger(el.powerType))], -10);
      B.barText(bar, el.text || '%p', el.textSize || 11);
      bar.xOffset = gx; bar.yOffset = centerY;
      return { rootIds: [bar.id], regions: [bar] };
    }
    case 'stackBar': {
      // a resource that is an AURA'S STACK COUNT, not a power type (e.g. cultist Insanity 0..100):
      // fill driven by trigger 1 "stacks", max pinned to el.max. debuffType BOTH scans buffs AND debuffs.
      const bar = B.baseBar(spec.id, el.id || `${spec.id} ${el.aura}`);
      bar.width = el.width || g.barWidth; bar.height = el.height || 14;
      B.gradient(bar, el.hi, el.lo);
      bar.backgroundColor = (el.bg || [0.1, 0.1, 0.1, 0.8]).slice();
      const trig = B.anyBuffTrigger([el.aura]);
      trig.debuffType = el.debuffType || 'BOTH';
      bar.triggers = B.wrap([B.T(trig)], 1);
      bar.progressSource = [1, 'stacks'];
      bar.useAdjustededMax = true; bar.adjustedMax = String(el.max);
      B.barText(bar, el.text || '%p', el.textSize || 11);
      bar.xOffset = gx; bar.yOffset = centerY;
      return { rootIds: [bar.id], regions: [bar] };
    }
    case 'buffWarnText': {
      // a big warning text shown ONLY while a maintenance buff is ABSENT (barbarian "CRY MISSING").
      // Built as a fully transparent aurabar used purely as a text carrier (no text-region template).
      const bar = B.baseBar(spec.id, el.id || `${spec.id} Warn - ${el.buff}`);
      bar.width = el.width || g.barWidth; bar.height = el.height || 22;
      bar.enableGradient = false;
      bar.barColor = [0, 0, 0, 0]; bar.backgroundColor = [0, 0, 0, 0];   // invisible bar
      bar.triggers = B.wrap([B.T(B.buffTrigger(el.buff, 'showAlways'))], 1);
      bar.progressSource = [-1, ''];
      const label = bar.subRegions.find(s => s.type === 'subtext');
      label.text_text = el.text; label.text_fontSize = el.fontSize || 20; label.text_fontType = 'OUTLINE';
      label.text_color = (el.color || [1, 0.2, 0.15, 1]).slice();
      label.anchor_point = 'INNER_CENTER'; label.text_visible = false;
      const border = bar.subRegions.find(s => s.type === 'subborder');
      if (border) border.border_visible = false;
      bar.conditions = [
        { check: { trigger: 1, variable: 'buffed', value: 0 }, changes: [{ property: 'sub.4.text_visible', value: true }] },
      ];
      bar.xOffset = gx; bar.yOffset = centerY;
      return { rootIds: [bar.id], regions: [bar] };
    }
    case 'healthBar': {
      const bar = B.baseBar(spec.id, el.id || `${spec.id} Health`);
      bar.width = g.barWidth; bar.height = el.height || 14;
      B.gradient(bar, el.hi, el.lo);
      bar.backgroundColor = (el.bg || [0.12, 0.03, 0.03, 0.85]).slice();
      bar.triggers = B.wrap([B.T(B.healthTrigger(el.unit || 'player'))], -10);
      B.barText(bar, el.text || '%p', 11);
      bar.xOffset = gx; bar.yOffset = centerY;
      return { rootIds: [bar.id], regions: [bar] };
    }
    case 'uptimeBar': {
      // a maintenance-buff countdown (green->yellow->red, red + warning + pulsing glow when it falls off).
      // buff = string (one buff) or string[] (any-of). See builders.js uptimeBar.
      const bar = B.uptimeBar(spec.id, {
        id: el.id || `${spec.id} ${typeof el.buff === 'string' ? el.buff : 'Uptime'}`,
        yOffset: centerY, width: g.barWidth, height: el.height || 14,
        buff: el.buff, label: el.label, warnText: el.warnText,
        bg: (el.bg || [0.05, 0.08, 0.03, 0.85]).slice(), downBg: el.downBg, colors: el.colors,
      });
      bar.xOffset = gx;
      return { rootIds: [bar.id], regions: [bar] };
    }
    case 'stacks': {
      const n = el.count, gap = el.gap || 4, height = el.height || 12;
      const boxW = (g.barWidth - (n - 1) * gap) / n, pitch = boxW + gap;
      const startX = -((n - 1) * pitch) / 2 + gx;
      const boxes = [];
      for (let i = 1; i <= n; i++) {
        const box = B.segmentBar(spec.id, {
          id: `${el.id || spec.id + ' Stack'} ${i}`, index: i,
          unit: el.unit || 'player', debuffType: el.debuffType || 'HELPFUL', auraNames: el.auraNames.slice(),
          unitExists: el.unitExists, hiColor: el.hi, loColor: el.lo, emptyBg: el.emptyBg || [0.09, 0.11, 0.09, 0.9],
          width: boxW, height, xOffset: startX + (i - 1) * pitch, yOffset: centerY,
        });
        // capGlow = { at?, unlessBuff?, color?, glowType? }: every box glows when the stack count reaches
        // `at` (default = count) — AND `unlessBuff` is missing, if given (e.g. Felfury capped at 6 while
        // Inner Demon is down = dump now). Mirrors classes/felsworn/build.js.
        if (el.capGlow) {
          const cg = el.capGlow;
          const checks = [{ op: '>=', trigger: 1, variable: 'stacks', value: String(cg.at != null ? cg.at : n) }];
          if (cg.unlessBuff) {
            box.triggers.__array.push(B.T(B.buffTrigger(cg.unlessBuff, 'showAlways')));   // -> trigger 3
            checks.push({ trigger: 3, variable: 'buffed', value: 0 });
          }
          box.subRegions = [...box.subRegions, B.subglow()];   // -> sub.5
          box.conditions.push({
            check: checks.length > 1 ? { checks, trigger: -2, variable: 'AND' } : checks[0],
            changes: [
              { property: 'sub.5.glow', value: true },
              { property: 'sub.5.glowType', value: cg.glowType || 'Pixel' },
              { property: 'sub.5.useGlowColor', value: true },
              { property: 'sub.5.glowColor', value: (cg.color || WHITE).slice() },
            ],
          });
        }
        boxes.push(box);
      }
      return { rootIds: boxes.map(b => b.id), regions: boxes };
    }
    case 'chargeStacks': {
      // segmented boxes driven by a SPELL'S CHARGES (runemaster Runeblade 0..3) — see chargeSegmentBar.
      const n = el.count, gap = el.gap || 4, height = el.height || 12;
      const boxW = (g.barWidth - (n - 1) * gap) / n, pitch = boxW + gap;
      const startX = -((n - 1) * pitch) / 2 + gx;
      const boxes = [];
      for (let i = 1; i <= n; i++) {
        boxes.push(B.chargeSegmentBar(spec.id, {
          id: `${el.id || spec.id + ' Charge'} ${i}`, index: i,
          spell: el.spell, byName: el.byName,
          hiColor: el.hi, loColor: el.lo, emptyBg: el.emptyBg || [0.09, 0.11, 0.09, 0.9],
          width: boxW, height, xOffset: startX + (i - 1) * pitch, yOffset: centerY,
        }));
      }
      return { rootIds: boxes.map(b => b.id), regions: boxes };
    }
    case 'buffRow': {
      // a centered row of buff-state icons (showOnActive any-of / weapon enchants / indicator) — see buffRowIcon.
      const size = el.size || (el.secondary ? g.secIconSize : g.iconSize);
      const dgId = el.id || `${spec.id} Buffs`;
      const icons = el.icons.map(c => buffRowIcon(spec, c, dgId, size));
      const dg = B.makeDynGroup(spec.id, dgId, icons, { yOffset: centerY, maxWidth: g.barWidth, iconSize: size });
      dg.xOffset = gx;
      return { rootIds: [dg.id], regions: [dg, ...icons] };
    }
    case 'cdRow': {
      const size = el.size || (el.secondary ? g.secIconSize : g.iconSize);
      const dgId = el.id || `${spec.id} CDs${el.secondary ? ' (Secondary)' : ''}`;
      const icons = el.icons.map(c => B.cooldownIcon(cdIconCfg(spec, c, dgId, size)));
      const dg = B.makeDynGroup(spec.id, dgId, icons, { yOffset: centerY, maxWidth: g.barWidth, iconSize: size });
      dg.xOffset = gx;
      return { rootIds: [dg.id], regions: [dg, ...icons] };
    }
    case 'procRow': {
      const size = el.size || g.procSize || 30;
      const dgId = el.id || `${spec.id} Procs`;
      const icons = el.icons.map(c => procIcon(spec, c, dgId, size));
      const dg = B.makeDynGroup(spec.id, dgId, icons, { yOffset: centerY, maxWidth: g.barWidth, iconSize: size });
      dg.xOffset = gx;
      return { rootIds: [dg.id], regions: [dg, ...icons] };
    }
    default: throw new Error(`unknown stack element kind "${el.kind}"`);
  }
}

// A side-rail column (makeColumn) of cooldown icons. col = { xOffset, yOffset?, size?, icons:[cdIcon] }.
function buildColumn(spec, col, side, g, gx, gy) {
  const size = col.size || g.iconSize;
  const colId = col.id || `${spec.id} ${side === 'left' ? 'DEF' : 'OFF'}`;
  const icons = col.icons.map(c => B.cooldownIcon(cdIconCfg(spec, c, colId, size)));
  const dg = B.makeColumn(spec.id, colId, icons, {
    xOffset: (col.xOffset != null ? col.xOffset : (side === 'left' ? -170 : 170)) + gx,
    yOffset: col.yOffset != null ? col.yOffset : gy, iconSize: size,
  });
  return { rootIds: [dg.id], regions: [dg, ...icons] };
}

// ---- SPEC validation: fail with a clear message BEFORE building any region ----
// (The UI edits SPECs as data; an incoherent one must produce a loud error, not a broken import string.)
const KINDS = new Set(['procRow', 'cdRow', 'buffRow', 'powerBar', 'healthBar', 'stackBar', 'uptimeBar', 'stacks', 'chargeStacks', 'buffWarnText']);
function validateSpec(spec) {
  if (!spec || !spec.id) throw new Error('SPEC needs an `id`');
  if (!Array.isArray(spec.stack) || !spec.stack.length) throw new Error('SPEC needs a non-empty `stack`');
  spec.stack.forEach((el, i) => {
    const at = `stack[${i}] "${el.kind}"`;
    const need = (ok, msg) => { if (!ok) throw new Error(`${at}: ${msg}`); };
    need(KINDS.has(el.kind), `unknown kind (known: ${[...KINDS].join(', ')})`);
    switch (el.kind) {
      case 'procRow':
        need(Array.isArray(el.icons), 'needs icons[]');
        el.icons.forEach((ic, j) => {
          const iat = `${at} icons[${j}] "${ic.label}"`;
          const ineed = (ok, msg) => { if (!ok) throw new Error(`${iat}: ${msg}`); };
          if (ic.when) validateWhenProc(ic, iat, ineed);
          else ineed(ic.buff || ic.execute != null || ic.stealable, 'needs when[] (or legacy buff / execute / stealable)');
        });
        break;
      case 'cdRow': case 'buffRow': need(Array.isArray(el.icons), 'needs icons[]'); break;
      case 'powerBar': need(el.powerType != null, 'needs powerType (a power index)'); break;
      case 'stackBar': need(el.aura && el.max, 'needs aura (buff name) + max'); break;
      case 'uptimeBar': need(el.buff, 'needs buff (a name or [names])'); break;
      case 'stacks': need(Array.isArray(el.auraNames) && el.count, 'needs auraNames[] + count'); break;
      case 'chargeStacks': need(el.spell && el.count, 'needs spell + count'); break;
      case 'buffWarnText': need(el.buff && el.text, 'needs buff + text'); break;
    }
  });
  for (const side of ['left', 'right']) {
    if (spec[side] && !Array.isArray(spec[side].icons)) throw new Error(`${side} column: needs icons[]`);
  }
}

// Pure: SPEC -> { name, group, children, combatOnly } (all regions built, no codec, no fs). Both the
// Node writer (specToPackage) and the browser (assembleTop + async encodeWA) consume this.
function specToParts(spec) {
  validateSpec(spec);
  const g = {
    barWidth: 250, iconSize: 26, secIconSize: 24, procSize: 30, gap: 3,
    xOffset: 0, yOffset: 0, ...(spec.global || {}),
  };
  const gx = g.xOffset, gy = g.yOffset, gap = g.gap;

  // 1. layout engine: center the vertical stack on gy, derive each element's center y (top -> bottom)
  const heights = spec.stack.map(el => elementHeight(el, g));
  const H = heights.reduce((a, b) => a + b, 0) + gap * (spec.stack.length - 1);
  let topEdge = gy + H / 2;
  const centers = heights.map(h => { const c = topEdge - h / 2; topEdge = c - h / 2 - gap; return c; });

  // 2. build every element + optional side columns
  const rootIds = [], children = [];
  spec.stack.forEach((el, i) => {
    const { rootIds: r, regions } = buildElement(spec, el, centers[i], g, gx);
    rootIds.push(...r); children.push(...regions);
  });
  for (const [side, col] of [['left', spec.left], ['right', spec.right]]) {
    if (!col) continue;
    const { rootIds: r, regions } = buildColumn(spec, col, side, g, gx, gy);
    rootIds.push(...r); children.push(...regions);
  }

  // 3. duplicate region ids would collide on uids (uidFor derives from id) and corrupt the import —
  // fail loudly instead (e.g. two procRows both defaulting to "<spec.id> Procs": give one an explicit id).
  const seen = new Set();
  for (const r of children) {
    if (seen.has(r.id)) throw new Error(`duplicate region id "${r.id}" — set an explicit id on one of the elements`);
    seen.add(r.id);
  }

  // 4. auto-wire the root group
  const group = B.makeGroup(spec.id, rootIds);
  return { name: spec.name || spec.id, group, children, combatOnly: spec.combatOnly };
}

module.exports = { specToParts, elementHeight, rowHeight };
