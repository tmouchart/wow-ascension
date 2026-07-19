// Browser-side persistence (localStorage). Two things live here:
//   - per-class DRAFTS: the live working SPEC for each class (autosaved on every edit, restored on reload) +
//     the last class edited, so the app reopens on the WA you were working on.
//   - named SNAPSHOTS: explicit "Save as" copies of a working SPEC, listed/loaded/deleted from the header.
// Everything is best-effort: private mode / quota / disabled storage must never crash the editor, so every
// access is wrapped and failures fall back to empty.
import type { Spec } from '../store';

const DRAFTS_KEY = 'waforge.drafts.v1';
const LAST_SLUG_KEY = 'waforge.lastSlug.v1';
const SNAPSHOTS_KEY = 'waforge.snapshots.v1';
const WELCOMED_KEY = 'waforge.welcomed.v1';

export type Snapshot = { id: string; name: string; slug: string; spec: Spec; createdAt: number };

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

// --- Per-class drafts -------------------------------------------------------
type Drafts = Record<string, Spec>;

export function loadDraft(slug: string): Spec | undefined {
  return read<Drafts>(DRAFTS_KEY, {})[slug];
}
export function saveDraft(slug: string, spec: Spec): void {
  const drafts = read<Drafts>(DRAFTS_KEY, {});
  drafts[slug] = spec;
  write(DRAFTS_KEY, drafts);
  write(LAST_SLUG_KEY, slug);
}
export function clearDraft(slug: string): void {
  const drafts = read<Drafts>(DRAFTS_KEY, {});
  delete drafts[slug];
  write(DRAFTS_KEY, drafts);
}
export function loadLastSlug(): string | undefined {
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
export function saveSnapshot(name: string, slug: string, spec: Spec): Snapshot {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const snap: Snapshot = { id, name, slug, spec, createdAt: Date.now() };
  write(SNAPSHOTS_KEY, [...read<Snapshot[]>(SNAPSHOTS_KEY, []), snap]);
  return snap;
}
export function deleteSnapshot(id: string): void {
  write(SNAPSHOTS_KEY, read<Snapshot[]>(SNAPSHOTS_KEY, []).filter((s) => s.id !== id));
}
