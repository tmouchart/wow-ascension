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
// Scope = the "basics" vocabulary: procRow, cdRow, powerBar, healthBar, stacks, + optional side columns.
// (Uptime bars / execute procs / stack-cap glows are on-demand extras, not modelled here yet.)
const B = require('./builders.js');

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
    default: throw new Error(`unknown glow.type "${g.type}"`);
  }
  return cfg;
}
function cdIconCfg(spec, c, parentId, size) {
  return applyGlow({
    id: `${spec.id} - ${c.label}`, parentId, size,
    spell: c.spell, byName: c.byName, charges: c.charges, fallbackIcon: c.fallbackIcon,
  }, c.glow);
}

// A proc icon: hidden (alpha 0) until its buff is up, then fades in + glows (Action Button Glow).
// Art comes from the cooldown trigger's fallback texture (by-name spell doesn't resolve on this client).
function procIcon(spec, c, parentId, size) {
  const b = B.iconBase(parentId, { id: `${spec.id} Proc - ${c.label}`, parentId, size, fallbackIcon: c.fallbackIcon });
  b.alpha = 0;
  b.triggers = B.wrap([B.T(B.cooldownTrigger(c.spell, c.byName)), B.T(B.buffTrigger(c.buff, 'showAlways'))], 1);
  b.conditions = [{
    check: { trigger: 2, variable: 'buffed', value: 1 },
    changes: [{ property: 'alpha', value: 1 }, ...B.glowChanges(c.glowColor || WHITE, c.glowType || 'buttonOverlay')],
  }];
  return b;
}

// ---- height of one stack element (drives the layout) ----
function elementHeight(el, g) {
  switch (el.kind) {
    case 'powerBar':
    case 'healthBar':
    case 'uptimeBar': return el.height || 14;
    case 'stacks': return el.height || 12;
    case 'procRow': {
      const size = el.size || g.procSize || 30;
      return rowHeight(el.icons.length, size, g.barWidth);
    }
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
      bar.width = g.barWidth; bar.height = el.height || 14;
      B.gradient(bar, el.hi, el.lo);
      bar.backgroundColor = (el.bg || [0.1, 0.1, 0.1, 0.8]).slice();
      bar.triggers = B.wrap([B.T(B.powerTrigger(el.powerType))], -10);
      B.barText(bar, el.text || '%p', 11);
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
        boxes.push(B.segmentBar(spec.id, {
          id: `${el.id || spec.id + ' Stack'} ${i}`, index: i,
          unit: el.unit || 'player', debuffType: el.debuffType || 'HELPFUL', auraNames: el.auraNames.slice(),
          unitExists: el.unitExists, hiColor: el.hi, loColor: el.lo, emptyBg: el.emptyBg || [0.09, 0.11, 0.09, 0.9],
          width: boxW, height, xOffset: startX + (i - 1) * pitch, yOffset: centerY,
        }));
      }
      return { rootIds: boxes.map(b => b.id), regions: boxes };
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

// Pure: SPEC -> { name, group, children, combatOnly } (all regions built, no codec, no fs). Both the
// Node writer (specToPackage) and the browser (assembleTop + async encodeWA) consume this.
function specToParts(spec) {
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

  // 3. auto-wire the root group
  const group = B.makeGroup(spec.id, rootIds);
  return { name: spec.name || spec.id, group, children, combatOnly: spec.combatOnly };
}

// Node path: build + encode (sync) + assert round-trip + write dist.
function specToPackage(spec) {
  return B.buildPackage(specToParts(spec));
}

module.exports = { specToParts, specToPackage };
