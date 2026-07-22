import type { El, Spec } from '../store';
import { BAR_PRESETS } from './defaultSpec';

// The kinds the user can freely add (and therefore remove); the rest ships with the class SPEC.
export const REMOVABLE = new Set(['powerBar', 'healthBar', 'uptimeBar', 'stacks', 'chargeStacks', 'stackBar', 'buffWarnText', 'iconRow']);

// The generator derives a region id from el.id (or a per-kind default like "<spec> Power") — two bars with
// the same effective id would collide (same region id -> same uid). Mirror those defaults when uniquifying.
export const effectiveId = (spec: Spec, el: El): string | undefined =>
  (el.id as string | undefined) ??
  (el.kind === 'powerBar' ? `${spec.id} Power`
    : el.kind === 'healthBar' ? `${spec.id} Health`
    : el.kind === 'stacks' ? `${spec.id} Stack`
    : el.kind === 'chargeStacks' ? `${spec.id} Charge`
    : el.kind === 'stackBar' ? `${spec.id} ${typeof el.aura === 'string' ? el.aura : 'Stack'}`
    : el.kind === 'buffWarnText' ? `${spec.id} Warn - ${el.buff}`
    : el.kind === 'uptimeBar' ? `${spec.id} ${typeof el.buff === 'string' ? el.buff : 'Uptime'}`
    : el.kind === 'iconRow' ? `${spec.id} Icons`
    : undefined);

// A BAR_PRESETS entry ready for addElement: the preset el + a region id uniquified against the current stack.
export function presetElement(spec: Spec, key: keyof typeof BAR_PRESETS): El {
  const preset = BAR_PRESETS[key];
  const taken = new Set(spec.stack.map((el) => effectiveId(spec, el)).filter(Boolean));
  const base = `${spec.id} ${preset.title}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base} ${n}`;
  return { ...preset.el, id };
}
