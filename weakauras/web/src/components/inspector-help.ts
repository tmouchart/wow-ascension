// Plain-English explanations for every inspector control, surfaced as hover "i" tooltips
// (see InfoTip in inspector-bits.tsx). Grounded in the element/glow taxonomy in CLAUDE.md.

// ---- Layout (Inspector "Layout" group) ----
export const LAYOUT_INFO: Record<string, string> = {
  barWidth: 'Pixel width of every bar, and the wrap width for cooldown rows — the whole WeakAura lines up to this width.',
  iconSize: 'Pixel size of the icons in the primary cooldown row.',
  secIconSize: 'Pixel size of the icons in the secondary (defensive / utility) row below health.',
  gap: 'Vertical spacing, in pixels, between stacked elements.',
  combatOnly: 'Hide the entire WeakAura while you are out of combat (adds a combat load condition to every region).',
};

// ---- Resource (power index) ----
export const POWER_INDEX_INFO =
  'The in-game UnitPower index this bar reads (0 = Mana, 3 = Energy, 4 = Combo, 9 = Holy Power). CoA custom resources do not map to standard indices — confirm the right number in-game.';

// ---- Elements (the toggle rows) ----
export const ELEMENT_INFO: Record<string, string> = {
  powerBar: 'Primary resource bar with a gradient fill and the current value as text. Reads UnitPower at the resource index set above.',
  healthBar: 'Your health as a red bar showing current HP.',
  uptimeBar: 'Countdown bar for a maintenance buff you keep up. Fades green -> yellow -> red as it expires, and flashes red when the buff drops off.',
  stacks: 'A row of boxes, one per point/stack of a self-buff (matched by aura name). Boxes fill as the stack grows.',
  chargeStacks: 'A row of boxes, one per charge of a charged spell. Boxes fill as charges become available.',
  stackBar: 'A bar driven by an aura stack count (0..max), for stack-based resources like Insanity.',
  buffWarnText: 'A text warning that appears while a buff is missing.',
  procRow: 'A row of proc icons that appear (and glow) when their conditions are met — telling you to cast a spell now.',
};

// ---- Inline element fields ----
export const ELEMENT_FIELD_INFO: Record<string, string> = {
  uptimeBar: 'Exact in-game name of the buff to track. A buff name can differ from its spell name — verify in-game.',
  stacks: 'Buff name to count stacks of, and how many boxes to show.',
  chargeStacks: 'Spell whose charges to track (matched by name), and how many charge boxes to show.',
  stackBar: 'Aura whose stack count fills the bar, and the maximum stack value (a full bar).',
  buffWarnText: 'Buff to watch for, and the warning text shown while it is absent.',
};

// ---- Glow style / color (shared by IconPanel and ProcPanel) ----
export const GLOW_STYLE_INFO =
  'Glow style signals urgency: Action Button = strong "act now" cue; Pixel = softer passive-state cue; ACShine = a shine sweep.';
export const GLOW_COLOR_INFO =
  'Glow color signals meaning: white = ready / proc up, class color = a defensive buff is active, gold/orange = optimal dump.';

// ---- CD-icon glow rules (IconPanel) ----
export const GLOW_RULE_INFO: Record<string, string> = {
  '': 'No glow on this icon.',
  buff: 'Glow while a specific buff is active on you.',
  buffMissing: 'Glow while a specific buff is NOT active on you (a reminder to reapply it).',
  ready: 'Glow when the spell is off cooldown and ready to cast.',
  readyPower: 'Glow when the spell is ready AND you have at least the set amount of resource.',
  powerPct: 'Glow when your resource is at or above the set percentage.',
  targetHealthBelow: "Glow when the target's health drops below the set percentage (execute range).",
};
export const ICON_INFO = {
  group: 'A cooldown icon: it greys out while on cooldown and can glow on one condition.',
  buffName: 'Exact in-game name of the buff this glow watches.',
  power: 'Minimum resource amount required for the glow to trigger.',
  powerPct: 'Resource percentage at/above which the glow triggers.',
  targetHp: 'Target-health percentage below which the glow triggers.',
  charges: "Show the spell's charge count as a number on the icon.",
  showPowerAbove: 'Only show this icon once you have at least this much resource. 0 = always shown.',
};

// ---- Proc panel ----
export const PROC_INFO = {
  group: 'A proc icon: hidden until its conditions are met, then it appears (and can glow) to tell you to cast now.',
  showWhen: 'The icon shows only when ALL of these conditions are true at the same time.',
  hide: 'What happens while the conditions are not met. "Keeps its slot" holds the icon\'s place (invisible); "Row recenters" removes it so the other icons re-center.',
  glowToggle: 'Add a glowing highlight while the proc is up.',
  glowExtra: 'Extra conditions that must ALSO hold for the glow — the icon still shows without them. Empty = glow whenever the proc is shown.',
  timer: "The icon's radial sweep + timer: the spell's cooldown, the tracked buff's remaining duration, or nothing.",
  stacks: "Show the tracked buff's stack count as a number on the icon.",
  cooldownNumbers: 'Show the countdown number in the middle of the icon while on cooldown.',
  desaturate: 'Grey out (desaturate) the icon while the spell is on cooldown.',
};

// Per-clause explanations for the proc "Show when" / "Glow only when" condition rows.
export const CLAUSE_INFO: Record<string, string> = {
  buff: 'True while the named buff is active on you.',
  buffMissing: 'True while the named buff is NOT active on you.',
  anyBuff: 'True while ANY of the listed buffs is active (comma-separated names).',
  buffStacks: "True when the named buff's stack count meets the comparison.",
  targetHpBelow: "True when the target's health is below this percentage.",
  powerAtLeast: 'True when your resource is at or above this amount.',
  spellReady: 'True when the spell is off cooldown.',
  charges: "True when the spell's charge count meets the comparison.",
  stealable: 'True when the target has a stealable / purgeable buff.',
};
