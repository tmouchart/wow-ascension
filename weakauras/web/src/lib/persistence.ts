// Browser-side persistence (localStorage). Two things live here:
//   - per-SPEC DRAFTS: the live working SPEC for each class+spec (autosaved on every edit, restored on
//     reload) + the last one edited, so the app reopens on the WA you were working on. Keyed by
//     `presetKey(slug, spec)` — a player runs 3-4 specs and each keeps its own draft.
//   - named SNAPSHOTS: explicit "Save as" copies of a working SPEC, listed/loaded/deleted from the header.
// Everything is best-effort: private mode / quota / disabled storage must never crash the editor, so every
// access is wrapped and failures fall back to empty.
import type { Spec } from '../store';

const DRAFTS_KEY = 'waforge.drafts.v1';
const LAST_SLUG_KEY = 'waforge.lastSlug.v1';
const SNAPSHOTS_KEY = 'waforge.snapshots.v1';
const WELCOMED_KEY = 'waforge.welcomed.v1';

export type Snapshot = { id: string; name: string; slug: string; specName?: string; spec: Spec; createdAt: number };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled storage — drop silently */
  }
}

// --- Per-spec drafts --------------------------------------------------------
// `key` is presetKey(slug, spec) — e.g. "starcaller/Warden". Drafts written before the editor knew about
// specs were keyed by the bare slug; loadDraft falls back to that so in-progress work survives the change.
type Drafts = Record<string, Spec>;

export function loadDraft(key: string): Spec | undefined {
  const drafts = read<Drafts>(DRAFTS_KEY, {});
  return drafts[key] ?? drafts[key.split('/')[0]];
}
export function saveDraft(key: string, spec: Spec): void {
  const drafts = read<Drafts>(DRAFTS_KEY, {});
  drafts[key] = spec;
  write(DRAFTS_KEY, drafts);
  write(LAST_SLUG_KEY, key);
}
export function clearDraft(key: string): void {
  const drafts = read<Drafts>(DRAFTS_KEY, {});
  delete drafts[key];
  delete drafts[key.split('/')[0]];   // also drop a pre-spec draft, else it resurfaces via the fallback
  write(DRAFTS_KEY, drafts);
}
export function loadLastKey(): string | undefined {
  return read<string | undefined>(LAST_SLUG_KEY, undefined);
}

// --- First-visit welcome flag ----------------------------------------------
// True once the user has dismissed the welcome modal, so it only shows on a first-ever visit.
export function hasWelcomed(): boolean {
  return read<boolean>(WELCOMED_KEY, false);
}
export function markWelcomed(): void {
  write(WELCOMED_KEY, true);
}

// --- Named snapshots --------------------------------------------------------
export function listSnapshots(): Snapshot[] {
  return read<Snapshot[]>(SNAPSHOTS_KEY, []).sort((a, b) => b.createdAt - a.createdAt);
}
export function saveSnapshot(name: string, slug: string, spec: Spec, specName?: string): Snapshot {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const snap: Snapshot = { id, name, slug, specName, spec, createdAt: Date.now() };
  write(SNAPSHOTS_KEY, [...read<Snapshot[]>(SNAPSHOTS_KEY, []), snap]);
  return snap;
}
export function deleteSnapshot(id: string): void {
  write(SNAPSHOTS_KEY, read<Snapshot[]>(SNAPSHOTS_KEY, []).filter((s) => s.id !== id));
}
