import { create } from 'zustand';
import felswornSpec from '../../classes/felsworn/spec.json';

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
  spec: Spec;
  sel: IconSel | null;
  setClass: (spec: Spec) => void;
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
  reset: () => void;
}

export const useStore = create<Store>((set) => ({
  spec: stampSpec(clone(felswornSpec) as Spec),
  sel: null,
  // Replace the whole SPEC (on class switch). stampSpec gives fresh sortable ids.
  setClass: (spec) => set({ spec: stampSpec(clone(spec)), sel: null }),
  select: (sel) => set({ sel }),
  addIcon: (ref, icon) => set((st) => {
    const spec = clone(st.spec);
    const el = ensureEl(spec, ref);
    if (!el.icons) el.icons = [];
    el.icons.push({ ...icon, _uid: nextUid() });
    return { spec };
  }),
  insertIcon: (ref, index, icon) => set((st) => {
    const spec = clone(st.spec);
    const el = ensureEl(spec, ref);
    if (!el.icons) el.icons = [];
    el.icons.splice(index, 0, { ...icon, _uid: nextUid() });
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
  reset: () => set({ spec: stampSpec(clone(felswornSpec) as Spec), sel: null }),
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
