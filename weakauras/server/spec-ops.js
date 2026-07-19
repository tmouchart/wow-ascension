// Pure agent operations: registry lookup + SPEC mutations. No LLM, no deps.
//
// Every mutating op is PURE — it returns a NEW spec (never touches the input) and re-validates it through
// the same `specToParts` the browser/golden-guardrail use. On any validation failure it returns
// `{ ok:false, error }` and NO spec, so a bad op can never corrupt the working spec. The AI SDK tool layer
// (server/tools.js) just wraps these; they are fully testable on their own (server/spec-ops.test.js).
const fs = require('fs');
const path = require('path');
const { specToParts } = require('../lib/spec-builder.js');

const REG_DIR = path.join(__dirname, '..', 'registry');
const clone = o => JSON.parse(JSON.stringify(o));

// ---- registry ----
const _regCache = new Map();
function loadRegistry(slug) {
  if (_regCache.has(slug)) return _regCache.get(slug);
  const p = path.join(REG_DIR, `${slug}.json`);
  if (!fs.existsSync(p)) throw new Error(`unknown class slug "${slug}"`);
  const r = JSON.parse(fs.readFileSync(p, 'utf8'));
  _regCache.set(slug, r);
  return r;
}

// Rank: exact name (0) < startsWith (1) < word-boundary/includes (2). Returns the trimmed public fields.
function searchAbilities(slug, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const a of loadRegistry(slug).abilities) {
    const n = a.name.toLowerCase();
    let rank;
    if (n === q) rank = 0;
    else if (n.startsWith(q)) rank = 1;
    else if (n.includes(q)) rank = 2;
    else continue;
    scored.push({ rank, a });
  }
  scored.sort((x, y) => x.rank - y.rank || x.a.name.length - y.a.name.length);
  return scored.slice(0, limit).map(({ a }) => ({
    spellId: a.spellId, name: a.name, primary: a.primary, tags: a.tags || [],
    cooldown: a.details?.Cooldown, iconUrl: a.iconUrl,
  }));
}

// Resolve a spell arg (numeric id, numeric string, or a name) to { spellId, name } via the registry.
// A name that resolves to several candidates returns them so the caller/agent can disambiguate.
function resolveSpell(slug, spell) {
  if (typeof spell === 'number') return { spellId: spell };
  const s = String(spell).trim();
  if (/^\d+$/.test(s)) return { spellId: Number(s) };
  const hits = searchAbilities(slug, s, 5);
  const exact = hits.filter(h => h.name.toLowerCase() === s.toLowerCase());
  const chosen = exact.length ? exact : hits;
  if (chosen.length === 1) return { spellId: chosen[0].spellId, name: chosen[0].name };
  if (chosen.length === 0) throw new Error(`no ability matching "${s}" in ${slug}`);
  const err = new Error(`"${s}" is ambiguous in ${slug}`);
  err.candidates = chosen;
  throw err;
}

// ---- read ----
// Compact, LLM-friendly view of the current spec. Each stack element shows its index + ALL of its own
// scalar fields (so updateElement has concrete targets: e.g. `count`, `powerType`, colors) with icon
// containers summarising the icons they hold. Also exposes global sizing/offsets, combatOnly, and side
// rails. Enough for the agent to orient and patch precisely without seeing the raw region JSON.
const GLOBAL_DEFAULTS = { barWidth: 250, iconSize: 26, secIconSize: 24, procSize: 30, gap: 3, xOffset: 0, yOffset: 0 };
const iconView = ic => {
  const out = { label: ic.label };
  if (ic.spell != null) out.spell = ic.spell;
  for (const k of ['glow', 'proc', 'charges', 'when', 'anyOf', 'weaponEnchant', 'indicator', 'showPowerAbove']) {
    if (ic[k] !== undefined) out[k] = ic[k];
  }
  return out;
};
function describeSpec(spec) {
  const elements = (spec.stack || []).map((el, index) => {
    const { icons, ...rest } = el;
    const out = { index, ...rest };
    if (icons) out.icons = icons.map(iconView);
    return out;
  });
  const rail = col => col && { icons: (col.icons || []).map(iconView), xOffset: col.xOffset, size: col.size };
  return {
    id: spec.id, name: spec.name, combatOnly: !!spec.combatOnly,
    global: { ...GLOBAL_DEFAULTS, ...(spec.global || {}) },
    elements, left: rail(spec.left), right: rail(spec.right),
  };
}

// ---- mutate (pure, validated) ----
// Every op runs its body against a CLONE, validates via specToParts, and returns { ok, spec, ... } or
// { ok:false, error }. `mutate` centralizes the clone + validate + never-throw contract; a body just
// mutates `next` and returns an extra result view (e.g. what it added).
function mutate(spec, body) {
  try {
    const next = clone(spec);
    const view = body(next) || {};
    const { children } = specToParts(next);   // throws on invalid element/field/dup id
    return { ok: true, spec: next, regions: children.length, ...view };
  } catch (e) {
    return { ok: false, error: String(e.message || e), ...(e.candidates ? { candidates: e.candidates } : {}) };
  }
}

// Fallback texture path for an icon (pre-cast art on procs/manual icons) from the registry `icon` field.
function iconPath(slug, spellId) {
  const a = loadRegistry(slug).abilities.find(x => x.spellId === spellId);
  return a && a.icon ? `Interface\\Icons\\${a.icon}` : undefined;
}

const cdRowOf = (spec, secondary) => spec.stack.find(el => el.kind === 'cdRow' && !!el.secondary === secondary);

// ---- generic element/icon/global CRUD (the "structure is generic, fields are typed + revalidated" surface) ----
const KIND_SET = new Set(['procRow', 'cdRow', 'buffRow', 'powerBar', 'healthBar', 'stackBar', 'uptimeBar', 'stacks', 'chargeStacks', 'buffWarnText']);
const CONTAINER_KIND = { primary: 'cdRow', secondary: 'cdRow', proc: 'procRow', buff: 'buffRow', left: 'cdRow', right: 'cdRow' };

// Merge-patch one plain object in place: null value deletes the key, everything else replaces wholesale.
function mergePatch(target, patch) {
  for (const [k, v] of Object.entries(patch)) { if (v === null) delete target[k]; else target[k] = v; }
  return target;
}

// Resolve a container ref (role name or a numeric stack index) to the { icons } holder. Roles: primary /
// secondary cdRow, proc(Row), buff(Row), left / right side rail. `create` seeds an absent role container.
function resolveContainer(spec, container, create) {
  if (typeof container === 'number') {
    const el = spec.stack[container];
    if (!el) throw new Error(`no element at index ${container}`);
    if (!Array.isArray(el.icons)) throw new Error(`element ${container} (${el.kind}) is not an icon container`);
    return el;
  }
  let holder;
  switch (container) {
    case 'primary': holder = cdRowOf(spec, false); break;
    case 'secondary': holder = cdRowOf(spec, true); break;
    case 'proc': holder = spec.stack.find(e => e.kind === 'procRow'); break;
    case 'buff': holder = spec.stack.find(e => e.kind === 'buffRow'); break;
    case 'left': case 'right': holder = spec[container]; break;
    default: throw new Error(`unknown container "${container}" (primary|secondary|proc|buff|left|right or an index)`);
  }
  if (holder) return holder;
  if (!create) throw new Error(`no ${container} container`);
  if (container === 'left' || container === 'right') return (spec[container] = { icons: [] });
  const el = { kind: CONTAINER_KIND[container], ...(container === 'secondary' ? { secondary: true } : {}), icons: [] };
  if (container === 'proc') spec.stack.unshift(el); else spec.stack.push(el);
  return el;
}
const containerKind = (spec, container) =>
  typeof container === 'number' ? spec.stack[container].kind : CONTAINER_KIND[container];

// Reject an icon shaped for the wrong container (cd-glow icon into a procRow, etc.) with a clear message.
function guardIcon(kind, icon) {
  if (kind === 'procRow') {
    if (!(icon.when || icon.buff || icon.execute != null || icon.stealable))
      throw new Error('a proc icon needs `when` (or legacy buff / execute / stealable)');
  } else if (kind === 'buffRow') {
    if (!(icon.anyOf || icon.weaponEnchant || icon.indicator))
      throw new Error('a buff icon needs one of anyOf / weaponEnchant / indicator');
  } else if (icon.when || icon.anyOf || icon.weaponEnchant || icon.indicator) {
    throw new Error('that is a proc/buff icon — add it to the proc or buff container instead');
  }
}

// Append a cooldown icon to the primary or secondary cdRow (creating that row at the end if absent).
function addCooldownIcon(spec, slug, { row = 'primary', spell }) {
  return mutate(spec, next => {
    const { spellId, name } = resolveSpell(slug, spell);
    const secondary = row === 'secondary';
    let cd = cdRowOf(next, secondary);
    if (!cd) { cd = { kind: 'cdRow', ...(secondary ? { secondary: true } : {}), icons: [] }; next.stack.push(cd); }
    (cd.icons ||= []).push({ label: name || String(spell), spell: spellId });
    return { added: { label: name || String(spell), spellId, row } };
  });
}

// Append a proc icon (procRow, creating it at the top if absent). `whenBuff` = show while that buff is up;
// default = show while the proc's own buff (its name) is up. Glows white (Action Button) whenever shown.
function addProc(spec, slug, { spell, whenBuff }) {
  return mutate(spec, next => {
    const { spellId, name } = resolveSpell(slug, spell);
    const label = name || String(spell);
    const ic = { label, spell: spellId, when: [{ buff: whenBuff || label }], glow: {},
      fallbackIcon: iconPath(slug, spellId) };
    if (!ic.fallbackIcon) delete ic.fallbackIcon;
    let pr = next.stack.find(el => el.kind === 'procRow');
    if (!pr) { pr = { kind: 'procRow', icons: [] }; next.stack.unshift(pr); }
    (pr.icons ||= []).push(ic);
    return { added: { label, spellId, whenBuff: whenBuff || label } };
  });
}

// Append an uptime bar tracking a buff's remaining duration.
function addUptimeBar(spec, { buff, label }) {
  return mutate(spec, next => {
    if (!buff) throw new Error('addUptimeBar needs a buff name');
    next.stack.push({ kind: 'uptimeBar', buff, label: label || `${buff}  %p`, warnText: buff });
    return { added: { kind: 'uptimeBar', buff } };
  });
}

// Set (or clear, type:'none') a glow rule on an existing cooldown icon, found by spell name/id or label.
function setCooldownGlow(spec, slug, { spell, row = 'primary', type, buff }) {
  return mutate(spec, next => {
    const cd = cdRowOf(next, row === 'secondary');
    if (!cd || !cd.icons) throw new Error(`no ${row} cdRow`);
    const key = String(spell).toLowerCase();
    let id; try { id = resolveSpell(slug, spell).spellId; } catch { /* match by label only */ }
    const ic = cd.icons.find(i => String(i.label).toLowerCase() === key || i.spell === id);
    if (!ic) throw new Error(`no icon "${spell}" in the ${row} cdRow`);
    if (type === 'none' || type == null) { delete ic.glow; return { updated: { spell, glow: null } }; }
    const needsBuff = type === 'buff' || type === 'buffMissing';
    if (needsBuff && !buff) throw new Error(`glow type "${type}" needs a buff name`);
    ic.glow = { type, ...(needsBuff ? { buff } : {}) };
    return { updated: { spell, glow: ic.glow } };
  });
}

// Remove a stack element by index.
function removeElement(spec, { index }) {
  return mutate(spec, next => {
    if (index < 0 || index >= next.stack.length) throw new Error(`no element at index ${index}`);
    const [gone] = next.stack.splice(index, 1);
    return { removed: { index, kind: gone.kind } };
  });
}

// Remove an icon from any container (by spell name/id or label). Container = a role or stack index;
// legacy { row, spell } (primary/secondary cdRow) still accepted.
function removeIcon(spec, slug, a) {
  const container = a.container != null ? a.container : (a.row === 'secondary' ? 'secondary' : 'primary');
  const match = a.match != null ? a.match : a.spell;
  return mutate(spec, next => {
    const c = resolveContainer(next, container, false);
    const key = String(match).toLowerCase();
    let id; try { id = resolveSpell(slug, match).spellId; } catch { /* match by label only */ }
    const i = c.icons.findIndex(ic => String(ic.label).toLowerCase() === key || ic.spell === id);
    if (i < 0) throw new Error(`no icon "${match}" in the ${container} container`);
    const [gone] = c.icons.splice(i, 1);
    return { removed: { label: gone.label, container } };
  });
}

// Reorder the vertical stack: move the element at `from` to index `to`.
function moveElement(spec, { from, to }) {
  return mutate(spec, next => {
    if (from < 0 || from >= next.stack.length) throw new Error(`no element at index ${from}`);
    const [el] = next.stack.splice(from, 1);
    next.stack.splice(Math.max(0, Math.min(to, next.stack.length)), 0, el);
    return { moved: { kind: el.kind, from, to } };
  });
}

// Toggle whether the whole WA is combat-only (hidden out of combat).
function setCombatOnly(spec, { on }) {
  return mutate(spec, next => {
    if (on) next.combatOnly = true; else delete next.combatOnly;
    return { combatOnly: !!on };
  });
}

// Add ANY stack element (typed per kind by the agent schema; `raw` merges rare fields). Container kinds
// are created empty — populate them with addIcon. `at` = insert position (default: end of the stack).
function addElement(spec, slug, { kind, at, raw, ...props }) {
  return mutate(spec, next => {
    if (!KIND_SET.has(kind)) throw new Error(`unknown kind "${kind}" (known: ${[...KIND_SET].join(', ')})`);
    const el = { kind, ...props, ...(raw || {}) };
    if (kind === 'chargeStacks' && typeof el.spell === 'string' && !el.byName) {
      const { spellId } = resolveSpell(slug, el.spell); el.spell = spellId;
    }
    if (['procRow', 'cdRow', 'buffRow'].includes(kind) && !Array.isArray(el.icons)) el.icons = [];
    const idx = at == null ? next.stack.length : Math.max(0, Math.min(at, next.stack.length));
    next.stack.splice(idx, 0, el);
    return { added: { kind, at: idx } };
  });
}

// Merge-patch an existing stack element's fields (null deletes a key). THE way to tweak a live element:
// e.g. { index, set: { count: 5 } } to change a stack box count, or { set: { hi: [...] } } to recolor a bar.
function updateElement(spec, { index, set }) {
  return mutate(spec, next => {
    const el = next.stack[index];
    if (!el) throw new Error(`no element at index ${index}`);
    mergePatch(el, set || {});
    return { updated: { index, kind: el.kind } };
  });
}

// Add an icon to any container (creating that role container if absent). The icon is typed by the agent
// schema; `spell` (cd/proc icons) is resolved to a spellId via the registry unless `byName`.
function addIcon(spec, slug, { container, icon }) {
  return mutate(spec, next => {
    const c = { ...icon };
    if (c.spell != null && !c.byName) {
      const { spellId, name } = resolveSpell(slug, c.spell);
      c.spell = spellId;
      if (!c.label) c.label = name || String(spellId);
    }
    if (!c.label) throw new Error('icon needs a label');
    guardIcon(containerKind(next, container), c);
    resolveContainer(next, container, true).icons.push(c);
    return { added: { label: c.label, container } };
  });
}

// Merge-patch an existing icon (found by spell name/id or label) in a container. null deletes a key —
// e.g. { set: { glow: null } } clears a glow rule; { set: { glow: { type: 'ready' } } } sets one.
function updateIcon(spec, slug, { container, match, set }) {
  return mutate(spec, next => {
    const c = resolveContainer(next, container, false);
    const key = String(match).toLowerCase();
    let id; try { id = resolveSpell(slug, match).spellId; } catch { /* match by label only */ }
    const ic = c.icons.find(i => String(i.label).toLowerCase() === key || i.spell === id);
    if (!ic) throw new Error(`no icon "${match}" in the ${container} container`);
    mergePatch(ic, set || {});
    guardIcon(containerKind(next, container), ic);
    return { updated: { label: ic.label, container } };
  });
}

// Patch global sizing/offsets and the combat-only flag. `combatOnly` lives at SPEC top level (false/null
// clears it); every other key merges into spec.global.
function setGlobal(spec, { set }) {
  return mutate(spec, next => {
    const s = { ...(set || {}) };
    if ('combatOnly' in s) { if (s.combatOnly) next.combatOnly = true; else delete next.combatOnly; delete s.combatOnly; }
    if (Object.keys(s).length) mergePatch((next.global ||= {}), s);
    return { global: { ...GLOBAL_DEFAULTS, ...(next.global || {}) }, combatOnly: !!next.combatOnly };
  });
}

module.exports = {
  loadRegistry, searchAbilities, resolveSpell, describeSpec,
  addElement, updateElement, addIcon, updateIcon, removeElement, removeIcon, moveElement, setGlobal,
  // legacy specialised ops (still used by spec-ops.test.js; superseded by the generic surface above)
  addCooldownIcon, addProc, addUptimeBar, setCooldownGlow, setCombatOnly,
};
