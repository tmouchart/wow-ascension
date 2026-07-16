import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import type { Ability } from '../registry';
import { AbilityTooltip } from './Tooltip';

type HoverFn = (a: Ability | null, e?: { x: number; y: number }) => void;

// Display order of primary categories in the grouped palette. Anything else falls to the end.
const CATEGORY_ORDER = ['Rotational', 'CD Offensif', 'CD Defensif', 'Control', 'Movement', 'Utility', 'Heal', 'Buff', 'Passive'];
const primaryOf = (a: Ability) => a.primary ?? (a.passive ? 'Passive' : 'Other');
const isActive = (a: Ability) => (a.primary ? a.primary !== 'Passive' : !!a.guessActive);

function PaletteItem({ ability, onHover }: { ability: Ability; onHover: HoverFn }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pal:${ability.spellId}`,
    data: { type: 'ability', ability },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn(
        'flex cursor-grab select-none items-center gap-2.5 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted',
        isDragging && 'opacity-40',
      )}
      onMouseEnter={(e) => onHover(ability, { x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => onHover(ability, { x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover(null)}>
      {/* draggable={false}: an <img> is natively draggable, which spawns a browser drag-ghost offset from
          the cursor that fights the dnd-kit overlay. Kill it so only the (cursor-centered) overlay shows. */}
      <img src={ability.iconUrl} alt="" loading="lazy" draggable={false}
        className="block size-[34px] flex-none rounded border border-border bg-card [-webkit-user-drag:none]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-tight">{ability.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {ability.source ?? ''}
          {ability.tags?.length ? <span className="opacity-70"> · {ability.tags.join(', ')}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function Palette({ abilities, loading }: { abilities: Ability[]; loading: boolean }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [selTags, setSelTags] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['Passive']));
  const [hover, setHover] = useState<{ a: Ability; x: number; y: number } | null>(null);
  const onHover: HoverFn = (a, e) => setHover(a && e ? { a, x: e.x, y: e.y } : null);

  // base list = active/all + search (tag chips are derived from THIS, before tag filtering)
  const base = useMemo(() => {
    let a = all ? abilities : abilities.filter(isActive);
    if (q.trim()) a = a.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    return a;
  }, [abilities, all, q]);

  // tags present in the base list, most frequent first
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of base) for (const t of a.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [base]);

  // apply tag filter (AND: an ability must carry every selected tag)
  const list = useMemo(
    () => (selTags.length ? base.filter((a) => selTags.every((t) => a.tags?.includes(t))) : base),
    [base, selTags],
  );

  // group by primary category, in display order
  const groups = useMemo(() => {
    const byCat = new Map<string, Ability[]>();
    for (const a of list) {
      const c = primaryOf(a);
      (byCat.get(c) ?? byCat.set(c, []).get(c)!).push(a);
    }
    const ordered = [...byCat.keys()].sort((x, y) => {
      const ix = CATEGORY_ORDER.indexOf(x), iy = CATEGORY_ORDER.indexOf(y);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    });
    return ordered.map((c) => [c, byCat.get(c)!] as const);
  }, [list]);

  const toggleTag = (t: string) => setSelTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const toggleCat = (c: string) => setCollapsed((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });

  return (
    <aside className="min-h-0 overflow-auto border-r bg-[image:var(--grad-pane)]">
      <div className="sticky top-0 z-[2] flex items-center justify-between border-b bg-[image:var(--grad-bar)] px-4 py-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Abilities</h2>
        <span className="text-[13px] text-muted-foreground">{loading ? '…' : `${list.length}`}</span>
      </div>
      <div className="px-3 pt-2.5">
        <Input placeholder="Search abilities…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="px-3.5 py-2.5">
        <ToggleGroup
          type="single"
          value={all ? 'all' : 'active'}
          onValueChange={(v) => { if (v) setAll(v === 'all'); }}
          size="sm"
        >
          <ToggleGroupItem value="active">Active</ToggleGroupItem>
          <ToggleGroupItem value="all">All {abilities.length || ''}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {tagCounts.length > 0 && (
        <div className="max-h-32 overflow-auto border-y bg-background/40 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {selTags.length > 0 && (
              <button onClick={() => setSelTags([])}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                clear
              </button>
            )}
            {tagCounts.map(([t, n]) => (
              <button key={t} onClick={() => toggleTag(t)}>
                <Badge variant={selTags.includes(t) ? 'default' : 'secondary'}
                  className="cursor-pointer hover:opacity-80">
                  {t} <span className="opacity-60">{n}</span>
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-2.5 pb-4">
        {groups.map(([cat, items]) => {
          const open = !collapsed.has(cat);
          return (
            <div key={cat}>
              <button onClick={() => toggleCat(cat)}
                className="sticky top-0 z-[1] mt-1 flex w-full items-center gap-1.5 bg-[image:var(--grad-pane)] px-1.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                <span className="inline-block w-3 text-[10px]">{open ? '▾' : '▸'}</span>
                {cat}
                <span className="font-normal opacity-60">{items.length}</span>
              </button>
              {open && items.map((a) => <PaletteItem key={a.spellId} ability={a} onHover={onHover} />)}
            </div>
          );
        })}
      </div>
      {hover && <AbilityTooltip ability={hover.a} x={hover.x} y={hover.y} />}
    </aside>
  );
}
