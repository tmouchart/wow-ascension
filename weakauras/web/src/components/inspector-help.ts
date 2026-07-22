// Plain-English explanations for every inspector control, surfaced as hover "i" tooltips
// (see InfoTip in inspector-bits.tsx). Grounded in the element/glow taxonomy in CLAUDE.md.

// ---- Layout (Inspector "Layout" group) ----
export const LAYOUT_INFO: Record<string, string> = {
  barWidth: 'Default pixel width of every element (bars, stack boxes, and the wrap width for icon rows). A bar can override it in its own panel.',
  iconSize: 'Pixel size of the icons in the primary cooldown row.',
  gap: 'Vertical spacing, in pixels, between stacked elements.',
  combatOnly: 'Hide the entire WeakAura while you are out of combat (adds a combat load condition to every region).',
};

// ---- Resource type (power bar) ----
export const POWER_INDEX_INFO =
  'Which resource this bar reads. Pick the one that fills the bar in-game — CoA custom resources sometimes live under a different type than their name suggests.';

// ---- Elements (the toggle rows) ----
export const ELEMENT_INFO: Record<string, string> = {
  powerBar: 'Primary resource bar with a gradient fill and the current value as text. Reads UnitPower at the resource index set above.',
  healthBar: 'Your health as a red bar showing current HP.',
  uptimeBar: 'Countdown bar for a maintenance buff you keep up. Fades green -> yellow -> red as it expires, and flashes red when the buff drops off.',
  stacks: 'A row of boxes, one per point/stack of a self-buff (matched by aura name). Boxes fill as the stack grows.',
  chargeStacks: 'A row of boxes, one per charge of a charged spell. Boxes fill as charges become available.',
  stackBar: 'A bar driven by an aura stack count (0..max), for stack-based resources like Insanity.',
  buffWarnText: 'A text warning that appears while a buff is missing.',
  iconRow: 'A row of ability icons. Each icon is SHOW IF / GLOW IF conditions: no show condition = an always-visible cooldown; add conditions to make it a proc that appears when you should cast.',
};

// ---- Per-element panel (ElementPanel) ----
export const ELEMENT_ENABLED_INFO =
  'Include this element in the generated WeakAura. Off = kept in the editor (dimmed in the preview) but not exported.';
export const BAR_INFO = {
  width: 'Width of THIS bar only, overriding the Global width. Reset to fall back to the global value.',
  height: 'Vertical size (px) of this bar.',
  color: "The fill gradient: left swatch = top color, right = bottom. Picking a resource type resets it to that resource's default.",
};

// ---- Inline element fields ----
export const ELEMENT_FIELD_INFO: Record<string, string> = {
  uptimeBar: 'Exact in-game name of the buff to track. A buff name can differ from its spell name — verify in-game.',
  stacks: 'Buff name to count stacks of, and how many boxes to show.',
  chargeStacks: 'Spell whose charges to track (matched by name), and how many charge boxes to show.',
  stackBar: 'Aura whose stack count fills the bar, and the maximum stack value (a full bar).',
  buffWarnText: 'Buff to watch for, and the warning text shown while it is absent.',
};

// ---- Glow style / color (shared across the unified IconPanel controls) ----
export const GLOW_STYLE_INFO =
  'Glow style signals urgency: Action Button = strong "act now" cue; Pixel = softer passive-state cue; ACShine = a shine sweep.';
export const GLOW_COLOR_INFO =
  'Glow color signals meaning: white = ready / proc up, class color = a defensive buff is active, gold/orange = optimal dump.';
export const STACKS_GLOW_INFO = {
  toggle: 'Make every box glow when conditions are met (e.g. stacks capped while a buff is down = dump now).',
  when: 'The boxes glow only while ALL of these conditions are true at the same time. Empty = glow permanently.',
};

// ---- Per-row panel (RowPanel) — overrides of the global style, for this row only ----
export const ROW_INFO = {
  group: 'Settings for this row only — they override the global style just here.',
  size: 'Icon size for this row, overriding the global icon size. Reset to fall back to the global value.',
  perRow: 'How many icons before the row wraps to a new line. Empty = fit as many as the bar width allows.',
  iconGap: 'Horizontal spacing (px) between icons in this row. Empty = the default (4).',
  combatOnly: 'Load this row (and its icons) only while in combat, independently of the global combat-only setting.',
};

// ---- Per-column panel (ColumnPanel) — a selected left/right side rail ----
export const COLUMN_INFO = {
  group: 'Settings for this side column only. In-game it sits at its X/Y offset from the WeakAura center and stacks its icons top to bottom.',
  size: 'Icon size for this column, overriding the global icon size.',
  iconGap: 'Vertical spacing (px) between the icons in this column. Default 4.',
  xOffset: 'Horizontal distance (px) of the column from the center of the WeakAura. Negative = left of center.',
  yOffset: 'Vertical center (px) of the column relative to the WeakAura center.',
};

// ---- Unified icon panel (IconPanel) ----
export const ICON_INFO = {
  group: 'An ability icon: no show condition = an always-visible cooldown; add show conditions to make it a proc. It can glow on its own conditions.',
  charges: "Show the spell's charge count as a number on the icon.",
  showWhen: 'Always = the icon is visible all the time (a cooldown). Show when… = it stays hidden (still tracking its cooldown) until ALL its conditions pass at once (a proc).',
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
  stacksAtLeast: "True when THIS element's own stack count is at or above this value (e.g. Felfury capped at 6).",
  buff: 'True while the named buff is active on you.',
  buffMissing: 'True while the named buff is NOT active on you.',
  anyBuff: 'True while ANY of the listed buffs is active (comma-separated names).',
  buffStacks: "True when the named buff's stack count meets the comparison.",
  targetHpBelow: "True when the target's health is below this percentage.",
  powerAtLeast: 'True when your primary resource (Mana / Rage / Energy...) is at or above this ABSOLUTE amount. Pick the resource type on the line below — CoA quirk: some classes sit on an unexpected type (e.g. Barbarian "Rage" is actually Energy).',
  powerPctAtLeast: 'True when your primary resource (Mana / Rage / Energy...) is at or above this PERCENT of its maximum. Pick the resource type on the line below.',
  spellReady: 'True when the spell is off cooldown.',
  charges: "True when the spell's charge count meets the comparison.",
  stealable: 'True when the target has a stealable / purgeable buff.',
};
