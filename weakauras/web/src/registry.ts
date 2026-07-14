import { useEffect, useState } from 'react';
import type { IconCfg } from './store';

// Per-class registry (registry/<slug>.json) is large, so lazy-load it via Vite's glob (one chunk per class).
const loaders = import.meta.glob('../../registry/*.json');

export type Ability = {
  spellId: number; name: string; iconUrl: string;
  source?: string; guessActive?: boolean; desc?: string;
  entryType?: string; level?: number; essence?: number;
};
type Registry = { slug: string; class: string; abilities: Ability[] };

const ICON_BASE = 'https://db.ascension.gg/static/images/wow/icons/medium/';
const PLACEHOLDER = ICON_BASE + 'inv_misc_questionmark.jpg';

// 'Interface\\Icons\\Spell_Fire_X' -> hosted URL (stub lowercased, parens URL-encoded, _border kept).
export function pathToIconUrl(path: string): string {
  const stub = path.replace(/^Interface\\Icons\\/i, '').toLowerCase();
  return ICON_BASE + stub.replace(/[()]/g, (c) => encodeURIComponent(c)) + '.jpg';
}

export type IconResolver = (icon: IconCfg) => string;

function buildResolver(reg: Registry): IconResolver {
  const byId = new Map<number, string>();
  const byName = new Map<string, string>();
  for (const a of reg.abilities) {
    byId.set(a.spellId, a.iconUrl);
    byName.set(a.name.toLowerCase(), a.iconUrl);
  }
  return (icon) => {
    if (typeof icon.spell === 'number' && byId.has(icon.spell)) return byId.get(icon.spell)!;
    if (typeof icon.spell === 'string' && byName.has(icon.spell.toLowerCase())) return byName.get(icon.spell.toLowerCase())!;
    if (icon.fallbackIcon) return pathToIconUrl(icon.fallbackIcon);
    return PLACEHOLDER;
  };
}

// Lazy-load a class registry; returns the ability list + an icon resolver for the preview. Tracks WHICH
// slug the loaded data is for: while the loaded reg doesn't match the current slug (mid-switch), `loading`
// is true and abilities are [] — never stale data from the previous class. That matters because the editor
// builds a class's default SPEC from `abilities`, and stale abilities would seed the wrong class.
export function useRegistry(slug: string) {
  const [state, setState] = useState<{ slug: string; reg: Registry | null }>({ slug: '', reg: null });
  useEffect(() => {
    let alive = true;
    const key = `../../registry/${slug}.json`;
    const load = loaders[key];
    if (load) load().then((m) => { if (alive) setState({ slug, reg: ((m as { default?: Registry }).default ?? m) as Registry }); });
    return () => { alive = false; };
  }, [slug]);
  const reg = state.slug === slug ? state.reg : null;   // only use data that belongs to the current slug
  return {
    abilities: reg?.abilities ?? [],
    className: reg?.class ?? '',
    resolveIcon: reg ? buildResolver(reg) : (() => PLACEHOLDER),
    loading: !reg,
  };
}
