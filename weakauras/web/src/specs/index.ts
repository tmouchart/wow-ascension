import type { Spec } from '../store';

// Curated per-class SPEC presets — the SAME classes/<name>/spec.json files the Node build consumes
// (single source of truth; web/src keeps no data copy). Keyed by registry slug (spec.json `slug`).
// Eager: 5 small JSON files, and the initial store state needs one synchronously.
const files = import.meta.glob('../../../classes/*/spec.json', { eager: true });

export const PRESETS: Record<string, Spec> = {};
for (const m of Object.values(files)) {
  const spec = ((m as { default?: unknown }).default ?? m) as Spec & { slug?: string };
  if (spec.slug) PRESETS[spec.slug] = spec;
}
