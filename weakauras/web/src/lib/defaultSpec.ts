import type { El, Spec } from '../store';
import type { Ability } from '../registry';
import RESOURCE from '../../../registry/resource-model.json';

// Auto-generate a sensible starting SPEC for any class from the registry: a cooldown row (its guessed-active
// abilities), a primary resource bar, and a health bar. Stacks / uptime / proc rows are NOT auto-added — they
// need per-class buff names the scrape doesn't have — so the user adds those from the editor.

type ResEntry = { primary?: { name?: string; index?: number | null }; confirmed?: boolean };
const RES = RESOURCE as Record<string, ResEntry>;

const HP_HI = [0.90, 0.16, 0.12, 1], HP_LO = [0.33, 0.02, 0.02, 1];

// Best-guess WoW power index by resource name. GOTCHA (see CLAUDE.md): on this client the name does NOT
// reliably map to the standard index (barbarian "Rage" reads index 3). So this is only a fallback for the
// classes whose index isn't confirmed — and it's user-editable in the inspector.
const NAME_TO_INDEX: Record<string, number> = {
  Mana: 0, Rage: 1, Focus: 2, Energy: 3, 'Combo Points': 4, 'Runic Power': 6,
};
// Bar color by resource name (also applied by the panel's "Resource type" dropdown).
export const POWER_COLOR: Record<string, [number[], number[]]> = {
  Mana: [[0.23, 0.51, 0.96, 1], [0.05, 0.12, 0.35, 1]],
  Rage: [[0.88, 0.33, 0.60, 1], [0.30, 0.05, 0.18, 1]],
  Energy: [[1, 0.88, 0.15, 1], [0.72, 0.42, 0, 1]],
  Focus: [[0.95, 0.55, 0.15, 1], [0.35, 0.15, 0, 1]],
  'Runic Power': [[0.30, 0.72, 0.92, 1], [0.05, 0.22, 0.35, 1]],
  'Combo Points': [[1, 0.82, 0.25, 1], [0.50, 0.33, 0.02, 1]],
  'Holy Power': [[0.95, 0.90, 0.55, 1], [0.45, 0.38, 0.08, 1]],
};
export const DEFAULT_COLOR: [number[], number[]] = [[0.55, 0.55, 0.62, 1], [0.15, 0.15, 0.20, 1]];

const CD_CAP = 12;
const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, '').trim() || 'Ability';

// Bars the user can always add from the inspector, whatever the class. `title` drives both the region-id
// suffix and the inspector label; powerType stays user-editable (the name→index gotcha above applies).
export const BAR_PRESETS: Record<string, { title: string; el: El }> = {
  hp: { title: 'Health', el: { kind: 'healthBar', hi: HP_HI, lo: HP_LO } },
  mana: { title: 'Mana', el: { kind: 'powerBar', title: 'Mana', powerType: 0, hi: POWER_COLOR.Mana[0], lo: POWER_COLOR.Mana[1], bg: [0.1, 0.1, 0.12, 0.8] } },
  energy: { title: 'Energy', el: { kind: 'powerBar', title: 'Energy', powerType: 3, hi: POWER_COLOR.Energy[0], lo: POWER_COLOR.Energy[1], bg: [0.1, 0.1, 0.12, 0.8] } },
  uptime: { title: 'Uptime bar', el: { kind: 'uptimeBar', buff: 'Buff name', label: 'Buff name  %p', warnText: 'MISSING', bg: [0.05, 0.08, 0.03, 0.85] } },
  stacks: { title: 'Stack boxes', el: { kind: 'stacks', auraNames: ['Buff name'], count: 5, hi: [0.45, 0.9, 0.06, 1], lo: [0.1, 0.32, 0, 1] } },
  charges: { title: 'Charge boxes', el: { kind: 'chargeStacks', spell: 'Spell name', byName: true, count: 3, hi: [0.45, 0.9, 0.06, 1], lo: [0.1, 0.32, 0, 1] } },
  stackBar: { title: 'Stack bar', el: { kind: 'stackBar', aura: 'Buff name', max: 100, hi: [0.62, 0.24, 0.82, 1], lo: [0.2, 0.05, 0.32, 1], bg: [0.1, 0.1, 0.12, 0.8] } },
  warn: { title: 'Warn text', el: { kind: 'buffWarnText', buff: 'Buff name', text: 'MISSING' } },
  iconrow: { title: 'Icon row', el: { kind: 'iconRow', icons: [] } },
};

// Is this class's power index confirmed in-game? (drives the inspector's "verify" hint)
export function powerIndexConfirmed(slug: string): boolean {
  const r = RES[slug];
  return !!(r?.confirmed && r.primary?.index != null);
}

export function buildDefaultSpec(slug: string, className: string, abilities: Ability[]): Spec {
  const seen = new Set<number>();
  const cds = abilities
    .filter((a) => a.guessActive && !seen.has(a.spellId) && seen.add(a.spellId))
    .slice(0, CD_CAP)
    .map((a) => ({ label: ascii(a.name), spell: a.spellId }));

  const res = RES[slug]?.primary ?? {};
  const name = res.name ?? 'Mana';
  const powerType = res.index != null ? res.index : (NAME_TO_INDEX[name] ?? 0);
  const [hi, lo] = POWER_COLOR[name] ?? DEFAULT_COLOR;

  const id = `${ascii(className)} SPEC`;
  return {
    id,
    name: `${slug}-spec`,
    global: { barWidth: 250, iconSize: 26, secIconSize: 24, procSize: 30, gap: 3 },
    stack: [
      { kind: 'iconRow', icons: cds },
      { kind: 'powerBar', title: name, powerType, hi, lo, bg: [0.1, 0.1, 0.12, 0.8] },
      { kind: 'healthBar', hi: HP_HI, lo: HP_LO },
    ],
  };
}
