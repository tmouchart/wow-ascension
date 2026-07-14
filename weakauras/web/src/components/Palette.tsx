import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import s from '../editor.module.css';
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
      className={`${s.abil} ${isDragging ? s.dragging : ''}`}
      onMouseEnter={(e) => onHover(ability, { x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => onHover(ability, { x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover(null)}>
      {/* draggable={false}: an <img> is natively draggable, which spawns a browser drag-ghost offset from
          the cursor that fights the dnd-kit overlay. Kill it so only the (cursor-centered) overlay shows. */}
      <img src={ability.iconUrl} alt="" loading="lazy" draggable={false} />
      <div><div className={s.nm}>{ability.name}</div><div className={s.mt}>{ability.source ?? ''}</div></div>
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
    <aside className={`${s.pane} ${s.left}`}>
      <div className={s.paneHead}><h2>Abilities</h2><span className={s.hint}>{loading ? '…' : `${list.length}`}</span></div>
      <div style={{ padding: '10px 12px 0' }}>
        <input className={s.search} placeholder="Search abilities…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className={s.pillrow}>
        <button className={s.pill} aria-pressed={!all} onClick={() => setAll(false)}>Active</button>
        <button className={s.pill} aria-pressed={all} onClick={() => setAll(true)}>All {abilities.length || ''}</button>
      </div>
      <div className={s.palwrap}>
        {list.map((a) => <PaletteItem key={a.spellId} ability={a} onHover={onHover} />)}
      </div>
      {hover && <AbilityTooltip ability={hover.a} x={hover.x} y={hover.y} />}
    </aside>
  );
}
