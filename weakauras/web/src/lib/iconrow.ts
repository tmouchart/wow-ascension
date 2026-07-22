import type { El, IconCfg, Spec } from '../store';
import type { Clause } from '../components/clauses';

// Normalize a SPEC to the unified `iconRow` model as it enters the editor. The disk presets are still
// `cdRow`/`procRow` (the 70-spec codemod is deferred), so we convert them in memory: every icon row becomes
// an `iconRow` and every legacy icon config (named glow.type / showPowerAbove / proc / when / buff / execute /
// stealable sugar) becomes the composable form { showWhen[], glow:{when[]}, display, hide }. The generator
// (lib/spec-builder.js iconElement) understands iconRow; the disk files are left untouched.
//
// This mirrors the Étape-1 legacy→iconRow mapping table in docs/spec-dsl-reference.md §4 and doubles as the
// reference logic for the eventual on-disk codemod. `legacyIconToIconRow` is idempotent — an already-iconRow
// icon passes through unchanged.

type AnyIcon = Record<string, unknown>;
type LegacyGlow = { type?: string; buff?: string; power?: number; pct?: number; targetHealthBelow?: number; op?: string; value?: number; spell?: number | string; byName?: boolean; color?: number[]; glowType?: string };
type Display = Record<string, unknown>;

const colorStyle = (g?: { color?: number[]; glowType?: string }) => ({
  ...(g?.color ? { color: g.color } : {}),
  ...(g?.glowType ? { glowType: g.glowType } : {}),
});

// A legacy cdRow glow rule -> glow.when clauses (powerType comes from the ICON, matching cooldownIcon's cfg).
function cdGlowToWhen(g: LegacyGlow, powerType?: number, ownSpell?: unknown): Clause[] | undefined {
  const pt = powerType != null ? { powerType } : {};
  switch (g.type) {
    case 'ready': return [{ spellReady: true }];
    case 'readyPower': return [{ spellReady: true }, { powerAtLeast: g.power, ...pt }];
    case 'powerPct': return [{ powerPctAtLeast: g.pct, ...pt }, ...(g.targetHealthBelow != null ? [{ targetHpBelow: g.targetHealthBelow }] : [])];
    case 'buff': return [{ buff: g.buff }];
    case 'buffMissing': return [{ buffMissing: g.buff }];
    case 'targetHealthBelow': return [{ targetHpBelow: g.pct }];
    case 'onCharges':
      // keep the charge SOURCE when it isn't the icon's own spell (runemaster Primordial Blast glows on
      // Runeblade's charges) — a spell-less charges clause reads the icon's own cooldown trigger
      return [{ charges: {
        ...(g.spell != null && String(g.spell) !== String(ownSpell) ? { spell: g.spell, ...(g.byName ? { byName: true } : {}) } : {}),
        op: g.op || '>=', value: g.value,
      } }];
    default: return undefined;   // no type: already an iconRow glow (has when, or empty)
  }
}

export function legacyIconToIconRow(ic: IconCfg): IconCfg {
  const out = { ...ic } as AnyIcon;
  const powerType = ic.powerType as number | undefined;

  // 1. proc when-DSL / legacy proc sugar -> showWhen (+ hide / glow / display), mirroring ProcPanel.procView
  if (ic.when !== undefined) {
    out.showWhen = ic.when;
  } else if (ic.buff || ic.execute != null || ic.stealable) {
    const legacyGlow = colorStyle({ color: ic.glowColor as number[] | undefined, glowType: ic.glowType as string | undefined });
    if (ic.stealable) {
      out.showWhen = [{ stealable: true }]; out.hide = 'collapse'; out.glow = legacyGlow;
    } else if (ic.execute != null) {
      out.showWhen = [{ targetHpBelow: ic.execute }]; out.hide = 'collapse';
      out.glow = { ...legacyGlow, ...(ic.glowAlways ? {} : { when: [{ spellReady: true }] }) };
      out.display = { desaturateOnCd: true, ...(ic.glowAlways ? { cooldownNumbers: false } : {}) };
    } else if (ic.buff) {
      out.showWhen = [{ buff: ic.buff }]; out.glow = legacyGlow;
    }
  }

  // 2. legacy cd gates: showPowerAbove -> showWhen[powerAtLeast]; proc-only icon -> showWhen[buff]
  if (ic.showPowerAbove != null && out.showWhen === undefined) {
    out.showWhen = [{ powerAtLeast: ic.showPowerAbove, ...(powerType != null ? { powerType } : {}) }];
    out.display = { ...(out.display as Display), desaturateOnCd: true };
  }
  const g = ic.glow as LegacyGlow | undefined;
  if (ic.proc != null && out.showWhen === undefined) {
    out.showWhen = [{ buff: ic.proc }];
    out.glow = colorStyle(g);
  }

  // 3. legacy named glow rule -> glow.when
  if (g && g.type) {
    const when = cdGlowToWhen(g, powerType, ic.spell);
    out.glow = { ...colorStyle(g), ...(when ? { when } : {}) };
    if (g.type === 'buff') out.display = { ...(out.display as Display), timer: 'buff' };   // preserve the swipe-takeover
  }

  // 4. drop every legacy key (top-level powerType is now carried by the clauses that need it)
  for (const k of ['when', 'buff', 'execute', 'stealable', 'glowAlways', 'glowColor', 'glowType', 'showPowerAbove', 'proc', 'powerType']) delete out[k];
  if (out.glow && !Object.keys(out.glow).length) delete out.glow;   // an empty glow object = no glow
  return out as IconCfg;
}

// A legacy buffRow icon (anyOf / weaponEnchant / indicator + lowPowerGlow) -> the composable form.
// Mirrors the generator's ex-buffRowIcon recipes: anyOf/weaponEnchant collapse away with the row recentering;
// an indicator stays visible, greyed out while its buff is missing (hide 'dim'). Idempotent like
// legacyIconToIconRow — an already-converted icon has none of the legacy keys and passes through.
function buffIconToIconRow(ic: IconCfg): IconCfg {
  const out = { ...ic } as AnyIcon;
  if (ic.anyOf) {
    out.showWhen = [{ anyBuff: ic.anyOf }]; out.hide = 'collapse';
  } else if (ic.weaponEnchant) {
    out.showWhen = [{ weaponEnchant: ic.weaponEnchant }]; out.hide = 'collapse';
  } else if (ic.indicator) {
    out.showWhen = [{ buff: ic.indicator }]; out.hide = 'dim';
    const lp = ic.lowPowerGlow as { pct: number; powerType?: number; color?: number[]; glowType?: string } | undefined;
    // powerType written explicitly (the generator's clause default is 3 = Energy; buffRow's was 0 = Mana)
    if (lp) out.glow = { ...colorStyle(lp), when: [{ powerPctBelow: lp.pct, powerType: lp.powerType ?? 0 }] };
  }
  for (const k of ['anyOf', 'weaponEnchant', 'indicator', 'lowPowerGlow']) delete out[k];
  return out as IconCfg;
}

const ICON_ROW_KINDS = new Set(['cdRow', 'procRow', 'buffRow', 'iconRow']);
// The generator defaults an id-less iconRow to `${spec.id} Icons`, so two id-less rows would collide once both
// are iconRow. Preserve the original per-kind default id (Procs / CDs / Buffs) so ids stay distinct AND stable.
const rowDefaultId = (specId: string, el: El): string =>
  el.kind === 'procRow' ? `${specId} Procs`
    : el.kind === 'cdRow' ? `${specId} CDs${el.secondary ? ' (Secondary)' : ''}`
    : el.kind === 'buffRow' ? `${specId} Buffs`
    : `${specId} Icons${el.secondary ? ' (Secondary)' : ''}`;
const convRow = (spec: Spec, el: El): El => {
  if (!el.icons) return el;
  // a size-less procRow rendered/generated at the generator's procSize (30) — an iconRow defaults to
  // iconSize (26), so the conversion must pin the size it actually had
  const size = el.size ?? (el.kind === 'procRow' ? Number(spec.global?.procSize ?? 30) : undefined);
  return { ...el, kind: 'iconRow', id: (el.id as string | undefined) ?? rowDefaultId(spec.id, el),
    ...(size != null ? { size } : {}), icons: el.icons.map(el.kind === 'buffRow' ? buffIconToIconRow : legacyIconToIconRow) };
};
// Side rails carry no `kind` in the SPEC (buildColumn infers canonical vs legacy per column) — convert icons only.
const convCol = (el?: El): El | undefined => (el?.icons ? { ...el, icons: el.icons.map(legacyIconToIconRow) } : el);

export function normalizeSpecToIconRow(spec: Spec): Spec {
  return {
    ...spec,
    stack: spec.stack.map((el) => (ICON_ROW_KINDS.has(el.kind) ? convRow(spec, el) : el)),
    left: convCol(spec.left),
    right: convCol(spec.right),
  };
}
