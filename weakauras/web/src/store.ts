import { create } from 'zustand';
import felswornSpec from '../../classes/felsworn/spec.json';
import { PRESETS } from './specs';
import { loadDraft, loadLastSlug } from './lib/persistence';

// The SPEC is the single source of truth the editor mutates; the preview and the generator both read it.
export type IconCfg = { label?: string; spell: number | string; byName?: boolean; fallbackIcon?: string; _uid?: string; [k: string]: unknown };
export type El = { kind: string; enabled?: boolean; icons?: IconCfg[]; secondary?: boolean; _uid?: string; [k: string]: unknown };
// A drop container is addressed either by its index in the central stack, or 'left'/'right' for the side rails.
export type Ref = number | 'left' | 'right';
export type Spec = { id: string; name: string; global: Record<string, number>; stack: El[]; left?: El; right?: El; combatOnly?: boolean };
// The currently-selected icon (per-icon inspector panel), addressed like a drop target.
export type IconSel = { ref: Ref; iconIndex: number };

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// Resolve a container ref to its El. `ensureEl` also creates a rail El on first drop; `readEl` never creates.
const readEl = (spec: Spec, ref: Ref): El | undefined =>
  ref === 'left' ? spec.left : ref === 'right' ? spec.right : spec.stack[ref];
function ensureEl(spec: Spec, ref: Ref): El {
  if (ref === 'left') return spec.left ?? (spec.left = { kind: 'left', icons: [] });
  if (ref === 'right') return spec.right ?? (spec.right = { kind: 'right', icons: [] });
  return spec.stack[ref];
}

// procRow icons carry the composable proc DSL (`when` clauses); other containers carry cdRow-style cfg.
// Normalize an icon as it enters/leaves a procRow (palette drop or cross-row drag) so it is always a valid
// config for its container — the generator fails loudly on a procRow icon with no when/legacy config.
function normalizeForContainer(el: El, ic: IconCfg) {
  if (el.kind === 'procRow') {
    const g = ic.glow as { type?: string; color?: number[]; glowType?: string } | undefined;
    if (g?.type) ic.glow = { ...(g.color ? { color: g.color } : {}), ...(g.glowType ? { glowType: g.glowType } : {}) };
    if (ic.charges) { ic.display = { ...(ic.display as object), stacks: true }; delete ic.charges; }
    delete ic.showPowerAbove;
    if (!ic.when && !ic.buff && ic.execute == null && !ic.stealable) {
      ic.when = [{ buff: (ic.label as string) ?? String(ic.spell) }];
      if (ic.glow === undefined) ic.glow = {};   // glow (white Action Button) whenever shown
    }
  } else {
    const d = ic.display as { stacks?: boolean } | undefined;
    if (d?.stacks) ic.charges = true;
    for (const k of ['when', 'hide', 'display', 'buff', 'execute', 'stealable', 'glowAlways', 'glowColor', 'glowType']) delete ic[k];
    const g = ic.glow as { type?: string } | undefined;
    if (g && !g.type) delete ic.glow;   // a proc-shaped glow (no rule type) isn't a cdRow glow rule
  }
}

// Stable ids for @dnd-kit/sortable (position-based keys break reorder tracking): one per icon AND one per
// stack element (the vertical containers are themselves sortable). Editor-only — stripped in
// activeStack/activeSpec before the SPEC is generated.
let uidCounter = 0;
const nextUid = () => `i${uidCounter++}`;
function stampSpec(spec: Spec): Spec {
  for (const el of spec.stack) el._uid = nextUid();
  for (const el of [...spec.stack, spec.left, spec.right])
    if (el?.icons) for (const ic of el.icons) ic._uid = nextUid();
  return spec;
}

// Human label for a stack element (inspector rows + element drag overlay).
const POWER_NAMES: Record<number, string> = { 0: 'Mana', 1: 'Rage', 2: 'Focus', 3: 'Energy', 4: 'Combo Points', 6: 'Runic Power' };
export function elementLabel(el: El): string {
  switch (el.kind) {
    case 'procRow': return 'Proc row';
    case 'cdRow': return el.secondary ? 'Secondary CD row' : 'CD row';
    case 'uptimeBar': return typeof el.buff === 'string' ? `Uptime: ${el.buff}` : 'Uptime bar';
    case 'powerBar': return `${(el.title as string) ?? POWER_NAMES[Number(el.powerType ?? 0)] ?? `Power ${el.powerType}`} bar`;
    case 'stacks': return 'Stack boxes';
    case 'chargeStacks': return 'Charge boxes';
    case 'stackBar': return `${(el.aura as string) ?? 'Stack'} bar`;
    case 'buffWarnText': return `Warn: ${el.buff}`;
    case 'buffRow': return 'Buff row';
    case 'healthBar': return 'Health bar';
    default: return el.kind;
  }
}

interface Store {
  slug: string;
  spec: Spec;
  sel: IconSel | null;
  setClass: (spec: Spec) => void;
  switchClass: (slug: string, spec: Spec) => void;
  select: (sel: IconSel | null) => void;
  addIcon: (ref: Ref, icon: IconCfg) => void;
  insertIcon: (ref: Ref, index: number, icon: IconCfg) => void;
  removeIcon: (ref: Ref, iconIndex: number) => void;
  moveIcon: (from: Ref, fromIndex: number, to: Ref, toIndex?: number) => void;
  setIconField: (ref: Ref, iconIndex: number, key: string, value: unknown) => void;
  addElement: (el: El) => void;
  removeElement: (stackIndex: number) => void;
  moveElement: (from: number, to: number) => void;
  toggleElement: (stackIndex: number) => void;
  setElementField: (stackIndex: number, key: string, value: unknown) => void;
  setGlobal: (key: string, value: number) => void;
  setCombatOnly: (v: boolean) => void;
  forceReload: () => void;
  reset: () => void;
}

// Boot: reopen on the last-edited class, restoring its saved draft (or its preset). If the last class has
// neither a draft nor a preset (a no-preset class whose draft wasn't flushed), we can't build its default
// SPEC synchronously (that needs the async registry) — so we boot with a sentinel slug that forces the
// Editor's load effect to run once the registry is ready. `initialSlug` drives App's class dropdown.
export const initialSlug = loadLastSlug() ?? 'felsworn';
const bootSpec = loadDraft(initialSlug) ?? PRESETS[initialSlug];

export const useStore = create<Store>((set) => ({
  slug: bootSpec ? initialSlug : '__boot__',
  spec: stampSpec(clone((bootSpec ?? felswornSpec) as Spec)),
  sel: null,
  // Replace the whole SPEC in place, keeping the current class (import / agent / undo). stampSpec gives
  // fresh sortable ids.
  setClass: (spec) => set({ spec: stampSpec(clone(spec)), sel: null }),
  // Load a class: set slug AND spec atomically so autosave never pairs a new slug with the old spec.
  switchClass: (slug, spec) => set({ slug, spec: stampSpec(clone(spec)), sel: null }),
  select: (sel) => set({ sel }),
  addIcon: (ref, icon) => set((st) => {
    const spec = clone(st.spec);
    const el = ensureEl(spec, ref);
    if (!el.icons) el.icons = [];
    const ic = { ...icon, _uid: nextUid() };
    normalizeForContainer(el, ic);
    el.icons.push(ic);
    return { spec };
  }),
  insertIcon: (ref, index, icon) => set((st) => {
    const spec = clone(st.spec);
    const el = ensureEl(spec, ref);
    if (!el.icons) el.icons = [];
    const ic = { ...icon, _uid: nextUid() };
    normalizeForContainer(el, ic);
    el.icons.splice(index, 0, ic);
    return { spec };
  }),
  removeIcon: (ref, iconIndex) => set((st) => {
    const spec = clone(st.spec);
    readEl(spec, ref)?.icons?.splice(iconIndex, 1);
    return { spec, sel: null };
  }),
  // Patch one field of one icon (the per-icon inspector). value === undefined deletes the key, so
  // "no glow" / "no gate" exports as an absent field rather than a null.
  setIconField: (ref, iconIndex, key, value) => set((st) => {
    const spec = clone(st.spec);
    const ic = readEl(spec, ref)?.icons?.[iconIndex];
    if (ic) {
      if (value === undefined) delete ic[key];
      else ic[key] = value;
    }
    return { spec };
  }),
  // Move an existing icon between containers (rows or rails) or reorder within one. toIndex undefined => append.
  moveIcon: (from, fromIndex, to, toIndex) => set((st) => {
    const spec = clone(st.spec);
    const src = readEl(spec, from)?.icons;
    if (!src) return { spec };
    const [item] = src.splice(fromIndex, 1);
    if (!item) return { spec };
    const dstEl = ensureEl(spec, to);
    if (dstEl.kind !== readEl(spec, from)?.kind) normalizeForContainer(dstEl, item);
    const dst = dstEl.icons ?? (dstEl.icons = []);
    let idx = toIndex ?? dst.length;
    if (from === to && fromIndex < idx) idx--;   // account for the removal shift
    dst.splice(idx, 0, item);
    return { spec, sel: null };   // indexes shifted — drop the selection rather than track it
  }),
  // Append a new stack element (e.g. a resource bar added from the inspector); reorder via drag.
  addElement: (el) => set((st) => {
    const spec = clone(st.spec);
    spec.stack.push({ ...clone(el), _uid: nextUid() });
    return { spec };
  }),
  removeElement: (stackIndex) => set((st) => {
    const spec = clone(st.spec);
    spec.stack.splice(stackIndex, 1);
    return { spec, sel: null };
  }),
  // Reorder the central stack (vertical drag & drop). `to` = the stack index of the element dropped onto.
  moveElement: (from, to) => set((st) => {
    const spec = clone(st.spec);
    const [el] = spec.stack.splice(from, 1);
    if (!el) return { spec };
    spec.stack.splice(to, 0, el);
    return { spec, sel: null };
  }),
  toggleElement: (stackIndex) => set((st) => {
    const spec = clone(st.spec);
    const el = spec.stack[stackIndex];
    el.enabled = el.enabled === false;   // undefined/true -> false, false -> true
    return { spec };
  }),
  setElementField: (stackIndex, key, value) => set((st) => {
    const spec = clone(st.spec);
    (spec.stack[stackIndex] as Record<string, unknown>)[key] = value;
    return { spec };
  }),
  setGlobal: (key, value) => set((st) => ({ spec: { ...st.spec, global: { ...st.spec.global, [key]: value } } })),
  setCombatOnly: (v) => set((st) => {
    const spec = { ...st.spec };
    if (v) spec.combatOnly = true;
    else delete spec.combatOnly;
    return { spec };
  }),
  // Force the Editor's load effect to re-fire (it has the registry needed to rebuild a non-preset default):
  // set a sentinel slug so it no longer matches App's selected class. Used by "Reset to preset" after the
  // class's draft is cleared.
  forceReload: () => set({ slug: '__reload__' }),
  reset: () => set({ slug: 'felsworn', spec: stampSpec(clone(felswornSpec) as Spec), sel: null }),
}));

// Dev-only handle for debugging/automation in the browser console (harmless; stripped from prod builds).
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__store = useStore;

// The stack the generator should actually consume: drop disabled elements, strip editor-only fields
// (element `enabled`, per-icon `_uid`) so the exported SPEC stays clean.
export function activeStack(spec: Spec): El[] {
  return spec.stack
    .filter((el) => el.enabled !== false)
    .map(({ enabled, _uid, icons, ...el }) => {
      void enabled; void _uid;
      return icons ? { ...el, icons: icons.map(({ _uid: iu, ...ic }) => { void iu; return ic; }) } : el;
    });
}

// Strip a rail for export: drop it entirely if empty, else strip per-icon `_uid`. An empty rail would emit
// an empty dynamicgroup, so we omit it (the generator's buildColumn skips a missing left/right).
const cleanCol = (el?: El): El | undefined =>
  el?.icons?.length ? { ...el, icons: el.icons.map(({ _uid, ...ic }) => { void _uid; return ic; }) } : undefined;

// The full generator-ready SPEC: cleaned central stack + cleaned side rails.
export function activeSpec(spec: Spec): Spec {
  return { ...spec, stack: activeStack(spec), left: cleanCol(spec.left), right: cleanCol(spec.right) };
}
