// Types for the esbuild-generated generator bundle (src/generated/generator.js, gitignored, built by
// `npm run gen`). Kept loose (any) — the source of truth is lib/spec-builder.js + lib/builders-core.js.
declare module '*/generated/generator.js' {
  export function specToParts(spec: unknown): { name: string; group: unknown; children: unknown[]; combatOnly?: boolean };
  export function assembleTop(parts: { group: unknown; children: unknown[]; combatOnly?: boolean }): unknown;
}
