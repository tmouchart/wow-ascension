import type { Spec } from '../store';

// Curated per-SPEC presets — the SAME classes/<name>/spec.json files the Node build consumes
// (single source of truth; web/src keeps no data copy). A class has 3-4 specs, each its own preset, so the
// key is `slug/spec` (presetKey) — keying by slug alone made the 4 starcaller presets overwrite each other.
// A preset with no `spec` yet (cultist, not attributed to one of its 4 specs) keys on its bare slug.
// Eager: small JSON files, and the initial store state needs one synchronously.
const files = import.meta.glob('../../../classes/*/spec.json', { eager: true });

/** Identity of a preset: the class slug, plus the spec name when the preset is attributed to one. */
export const presetKey = (slug: string, spec?: string): string => (spec ? `${slug}/${spec}` : slug);

export const PRESETS: Record<string, Spec> = {};
/** slug -> the spec names of that class that actually have a preset. */
export const SPECS_WITH_PRESET: Record<string, string[]> = {};

for (const m of Object.values(files)) {
  const spec = ((m as { default?: unknown }).default ?? m) as Spec & { slug?: string; spec?: string };
  if (!spec.slug) continue;
  PRESETS[presetKey(spec.slug, spec.spec)] = spec;
  if (spec.spec) (SPECS_WITH_PRESET[spec.slug] ??= []).push(spec.spec);
}
