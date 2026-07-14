import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import type { Ability } from '../registry';
import { AbilityTooltip } from './Tooltip';

type HoverFn = (a: Ability | null, e?: { x: number; y: number }) => void;

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
      <div className="min-w-0">
        <div className="truncate text-sm leading-tight">{ability.name}</div>
        <div className="text-xs text-muted-foreground">{ability.source ?? ''}</div>
      </div>
    </div>
  );
}

export function Palette({ abilities, loading }: { abilities: Ability[]; loading: boolean }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [hover, setHover] = useState<{ a: Ability; x: number; y: number } | null>(null);
  const onHover: HoverFn = (a, e) => setHover(a && e ? { a, x: e.x, y: e.y } : null);
  const list = useMemo(() => {
    let a = all ? abilities : abilities.filter((x) => x.guessActive);
    if (q.trim()) a = a.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    return a;
  }, [abilities, all, q]);

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
      <div className="px-2.5 pb-4">
        {list.map((a) => <PaletteItem key={a.spellId} ability={a} onHover={onHover} />)}
      </div>
      {hover && <AbilityTooltip ability={hover.a} x={hover.x} y={hover.y} />}
    </aside>
  );
}
