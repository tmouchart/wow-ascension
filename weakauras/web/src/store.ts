import { create } from 'zustand';
import { felswornSpec } from './specs/felsworn';

// The SPEC is the single source of truth the editor mutates; the preview and the generator both read it.
export type IconCfg = { label?: string; spell: number | string; byName?: boolean; fallbackIcon?: string; _uid?: string; [k: string]: unknown };
export type El = { kind: string; enabled?: boolean; icons?: IconCfg[]; secondary?: boolean; [k: string]: unknown };
export type Spec = { id: string; name: string; global: Record<string, number>; stack: El[] };

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// Stable per-icon id for @dnd-kit/sortable (position-based keys break reorder tracking). Editor-only —
// stripped in activeStack before the SPEC is generated.
let uidCounter = 0;
const nextUid = () => `i${uidCounter++}`;
function stampIcons(spec: Spec): Spec {
  for (const el of spec.stack) if (el.icons) for (const ic of el.icons) ic._uid = nextUid();
  return spec;
}

interface Store {
  spec: Spec;
  setClass: (spec: Spec) => void;
  addIcon: (stackIndex: number, icon: IconCfg) => void;
  insertIcon: (stackIndex: number, index: number, icon: IconCfg) => void;
  removeIcon: (stackIndex: number, iconIndex: number) => void;
  moveIcon: (fromStack: number, fromIndex: number, toStack: number, toIndex?: number) => void;
  toggleElement: (stackIndex: number) => void;
  setElementField: (stackIndex: number, key: string, value: unknown) => void;
  setGlobal: (key: string, value: number) => void;
  reset: () => void;
}

export const useStore = create<Store>((set) => ({
  spec: stampIcons(clone(felswornSpec) as Spec),
  // Replace the whole SPEC (on class switch). stampIcons gives fresh sortable ids.
  setClass: (spec) => set({ spec: stampIcons(clone(spec)) }),
  addIcon: (stackIndex, icon) => set((st) => {
    const spec = clone(st.spec);
    const el = spec.stack[stackIndex];
    if (!el.icons) el.icons = [];
    el.icons.push({ ...icon, _uid: nextUid() });
    return { spec };
  }),
  insertIcon: (stackIndex, index, icon) => set((st) => {
    const spec = clone(st.spec);
    const el = spec.stack[stackIndex];
    if (!el.icons) el.icons = [];
    el.icons.splice(index, 0, { ...icon, _uid: nextUid() });
    return { spec };
  }),
  removeIcon: (stackIndex, iconIndex) => set((st) => {
    const spec = clone(st.spec);
    spec.stack[stackIndex].icons?.splice(iconIndex, 1);
    return { spec };
  }),
  // Move an existing icon between rows or reorder within one. toIndex undefined => append.
  moveIcon: (fromStack, fromIndex, toStack, toIndex) => set((st) => {
    const spec = clone(st.spec);
    const src = spec.stack[fromStack].icons;
    if (!src) return { spec };
    const [item] = src.splice(fromIndex, 1);
    if (!item) return { spec };
    const dst = spec.stack[toStack].icons ?? (spec.stack[toStack].icons = []);
    let idx = toIndex ?? dst.length;
    if (fromStack === toStack && fromIndex < idx) idx--;   // account for the removal shift
    dst.splice(idx, 0, item);
    return { spec };
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
  reset: () => set({ spec: stampIcons(clone(felswornSpec) as Spec) }),
}));

// Dev-only handle for debugging/automation in the browser console (harmless; stripped from prod builds).
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__store = useStore;

// The stack the generator should actually consume: drop disabled elements, strip editor-only fields
// (element `enabled`, per-icon `_uid`) so the exported SPEC stays clean.
export function activeStack(spec: Spec): El[] {
  return spec.stack
    .filter((el) => el.enabled !== false)
    .map(({ enabled, icons, ...el }) => {
      void enabled;
      return icons ? { ...el, icons: icons.map(({ _uid, ...ic }) => { void _uid; return ic; }) } : el;
    });
}
