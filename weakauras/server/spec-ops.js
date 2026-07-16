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
// Compact, LLM-friendly view of the current spec: each stack element with its kind, label and, for
// icon containers, the icons it holds. Enough for the agent to orient without seeing the raw SPEC.
function describeSpec(spec) {
  const elements = (spec.stack || []).map((el, index) => {
    const out = { index, kind: el.kind };
    if (el.secondary) out.secondary = true;
    if (el.buff) out.buff = el.buff;
    if (el.icons) out.icons = el.icons.map(ic => ({ label: ic.label, spell: ic.spell }));
    return out;
  });
  return { id: spec.id, name: spec.name, combatOnly: !!spec.combatOnly, elements };
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

// Remove an icon (by spell name/id or label) from the primary/secondary cdRow.
function removeIcon(spec, slug, { row = 'primary', spell }) {
  return mutate(spec, next => {
    const cd = cdRowOf(next, row === 'secondary');
    if (!cd || !cd.icons) throw new Error(`no ${row} cdRow`);
    const key = String(spell).toLowerCase();
    let id; try { id = resolveSpell(slug, spell).spellId; } catch { /* match by label only */ }
    const i = cd.icons.findIndex(ic => String(ic.label).toLowerCase() === key || ic.spell === id);
    if (i < 0) throw new Error(`no icon "${spell}" in the ${row} cdRow`);
    const [gone] = cd.icons.splice(i, 1);
    return { removed: { label: gone.label, row } };
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

module.exports = {
  loadRegistry, searchAbilities, resolveSpell, describeSpec,
  addCooldownIcon, addProc, addUptimeBar, setCooldownGlow, removeElement, removeIcon, moveElement, setCombatOnly,
};
